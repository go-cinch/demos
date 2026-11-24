<script setup lang="ts">
import type { UserInfoWithPermissions } from '#/api';

import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useTimezoneStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Tag } from 'ant-design-vue';

import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import EmailBindingForm from '#/security/email-binding-form.vue';
import { useAuthStore } from '#/store';
import { emailEnabled } from '#/store/system-properties';

import EmailUnlink from './email-unlink.vue';
import SecuritySection from './security-section.vue';

const props = defineProps<{ user: null | UserInfoWithPermissions }>();
const auth = useAuthStore();
const { hasProfileAction } = usePermissions();
const canBind = computed(() => hasProfileAction('bind_email'));
const canUnlink = computed(
  () =>
    hasProfileAction('unlink_by_email') || hasProfileAction('unlink_by_factor'),
);
const timezone = useTimezoneStore();
const active = ref(true);
const open = ref(false);
const busy = ref(false);
const formKey = ref(0);
const email = computed(() => props.user?.email || '');
watch(email, () => {
  open.value = false;
});
const masked = computed(() => {
  const at = email.value.lastIndexOf('@');
  return `${email.value.slice(0, Math.min(2, at))}***${email.value.slice(at)}`;
});
const boundAt = computed(() => {
  void timezone.timezone;
  return props.user?.emailVerifiedAt
    ? formatDateTime(props.user.emailVerifiedAt)
    : '';
});

const route = useRoute();
const router = useRouter();
const bindButton = ref<InstanceType<typeof Button>>();
const bindingCue = ref(false);
let cueTimer: ReturnType<typeof setTimeout> | undefined;
let cueVersion = 0;
function clearBindingCue() {
  cueVersion++;
  clearTimeout(cueTimer);
  bindingCue.value = false;
}
function openBinding() {
  clearBindingCue();
  open.value = true;
}
watch(
  [() => route.query.focus, () => props.user, active, emailEnabled, canBind],
  async ([focus, user, visible]) => {
    if (
      route.path !== '/profile' ||
      focus !== 'email' ||
      !user ||
      !visible ||
      !emailEnabled.value ||
      !canBind.value
    )
      return;
    if (email.value) {
      const { focus: _focus, ...query } = route.query;
      await router.replace({ query });
      return;
    }
    clearBindingCue();
    bindingCue.value = true;
    const version = cueVersion;
    await nextTick();
    if (!active.value || cueVersion !== version) return;
    bindButton.value?.$el?.scrollIntoView?.({
      block: 'center',
      behavior: 'instant',
    });
    bindButton.value?.$el?.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    cueTimer = setTimeout(
      async () => {
        if (!active.value || cueVersion !== version) return;
        openBinding();
        const { focus: _focus, ...query } = route.query;
        await router.replace({ query });
      },
      reducedMotion ? 0 : 900,
    );
  },
  { immediate: true, flush: 'post' },
);
onBeforeUnmount(clearBindingCue);

onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
  clearBindingCue();
});
</script>

<template>
  <SecuritySection
    v-if="user && emailEnabled"
    v-model:open="open"
    icon="lucide:mail"
    :title="$t('profile-center.emailBinding')"
    :busy="busy"
    data-testid="profile-email"
  >
    <template #status>
      <Tag :color="email ? 'green' : 'orange'">
        {{
          $t(
            email
              ? 'profile-center.emailVerified'
              : 'profile-center.emailUnbound',
          )
        }}
      </Tag>
    </template>
    <template v-if="email" #summary>
      <p class="email-address">{{ masked }}</p>
      <p v-if="boundAt">
        {{ $t('profile-center.emailBoundAt', { time: boundAt }) }}
      </p>
    </template>
    <template #actions>
      <EmailUnlink
        v-if="email && active && canUnlink"
        :key="`${user.userId}:${email}`"
        :masked="masked"
      />
      <Button
        v-else-if="!email && canBind"
        ref="bindButton"
        :class="{ 'email-binding-cue': bindingCue }"
        :disabled="busy"
        :aria-expanded="open"
        @click="open ? (open = false) : openBinding()"
      >
        {{ $t(open ? 'profile-center.collapse' : 'profile-center.bindEmail') }}
      </Button>
    </template>
    <EmailBindingForm
      v-if="!email && active && canBind"
      :key="`${user.userId}:${formKey}`"
      inline
      :draft-user-id="user.userId"
      :current-session="auth.captureSession()"
      :complete="auth.completeProfileEmailBinding"
      @busy="busy = $event"
      @cancel="
        open = false;
        formKey++;
      "
    />
  </SecuritySection>
</template>

<style scoped>
.email-binding-cue {
  color: hsl(var(--primary));
  border-color: hsl(var(--primary));
  animation: email-binding-cue 450ms ease-out 2;
}

@keyframes email-binding-cue {
  0%,
  100% {
    box-shadow: 0 0 0 0 hsl(var(--primary) / 0%);
    transform: scale(1);
  }

  35% {
    box-shadow: 0 0 0 5px hsl(var(--primary) / 18%);
    transform: scale(1.025);
  }

  70% {
    box-shadow: 0 0 0 9px hsl(var(--primary) / 0%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .email-binding-cue {
    animation: none;
  }
}

.email-address {
  font-weight: 500;
}
</style>
