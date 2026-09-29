<script setup lang="ts">
import { focusFirstInvalid, message, type Feedback } from '../lib/form-feedback';
import { onMounted, ref, watch } from 'vue';
import { useUnsavedForm } from '../lib/unsaved-form';
import DiscardSheet from '../components/DiscardSheet.vue';
import { useRoute } from 'vue-router';
import { ApiError, loadUser, logout, session, submitCredentials } from '../lib/api';
import type { CaptchaPoint, PointCaptcha as Challenge } from '../lib/types';
import { initials } from '../lib/format';
import { t } from '../locales';
import { nonempty, trimCredential } from '../lib/validation';
import Icon from '../components/Icon.vue';
import Sheet from '../components/Sheet.vue';
import Field from '../components/Field.vue';
import PointCaptcha from '../components/PointCaptcha.vue';
const route = useRoute();
const infoError = ref('');
const infoLoading = ref(true);
onMounted(async () => {
  try {
    await loadUser();
  } catch (e) {
    infoError.value = (e as Error).message;
  } finally {
    infoLoading.value = false;
  }
});
const passwordOpen = ref(route.query.tab === 'password');
const infoOpen = ref(false);
const confirmLogout = ref(false);
const oldPassword = ref('');
const newPassword = ref('');
const confirmation = ref('');
const errors = ref<Record<string, Feedback>>({});
const formElement = ref<HTMLFormElement>();
const error = ref('');
const busy = ref(false);
const captcha = ref<Challenge>();
const points = ref<CaptchaPoint[]>([]);
const { discardOpen, decide, beforeClose } = useUnsavedForm(
  () => passwordOpen.value && !!(oldPassword.value || newPassword.value || confirmation.value),
  () => passwordOpen.value && busy.value,
);
watch(passwordOpen, (open) => {
  if (!open) {
    oldPassword.value = '';
    newPassword.value = '';
    confirmation.value = '';
    errors.value = {};
    error.value = '';
    captcha.value = undefined;
    points.value = [];
  }
});
async function submit() {
  errors.value = {};
  error.value = '';
  const normalizedOldPassword = trimCredential(oldPassword.value);
  const normalizedNewPassword = trimCredential(newPassword.value);
  const normalizedConfirmation = trimCredential(confirmation.value);
  if (!nonempty(normalizedOldPassword))
    errors.value.old = message('app.validation.currentPassword');
  if (!nonempty(normalizedNewPassword)) errors.value.password = message('app.validation.password');
  if (normalizedNewPassword !== normalizedConfirmation)
    errors.value.confirmation = message('page.profile.password.passwordMismatch');
  if (captcha.value && !points.value.length)
    errors.value.captcha = message('app.validation.verification');
  if (Object.keys(errors.value).length) {
    await focusFirstInvalid(formElement.value);
    return;
  }
  busy.value = true;
  try {
    await submitCredentials('password_change', {
      old_password: normalizedOldPassword,
      new_password: normalizedNewPassword,
      captcha_id: captcha.value?.captcha_id,
      captcha_points: points.value.length ? points.value : undefined,
    });
    passwordOpen.value = false;
    await logout();
  } catch (e) {
    error.value = (e as Error).message;
    if (e instanceof ApiError && e.data.captcha) {
      captcha.value = e.data.captcha;
      points.value = [];
    }
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page">
    <p v-if="infoError" class="form-error" role="alert">{{ infoError }}</p>
    <header class="page-heading">
      <div>
        <p class="eyebrow">{{ t('workspace') }}</p>
        <h1>{{ t('mine') }}</h1>
      </div>
    </header>
    <section class="profile-card card" :aria-busy="infoLoading">
      <t-skeleton v-if="infoLoading" animation="gradient" theme="avatar" />
      <template v-else>
        <span class="avatar large">{{ initials(session.user?.username || '') }}</span>
        <h2>{{ session.user?.username }}</h2>
        <p>{{ session.user?.role?.name || '—' }}</p>
        <small class="muted">{{ session.user?.code }}</small>
      </template>
    </section>
    <h2 class="section-title">{{ t('page.auth.profile') }}</h2>
    <section class="card">
      <button class="menu-row" @click="infoOpen = true">
        <Icon name="user" /><span>{{ t('profile') }}</span
        ><Icon name="chevron-right" /></button
      ><button class="menu-row" @click="passwordOpen = true">
        <Icon name="lock-on" /><span>{{ t('password') }}</span
        ><Icon name="chevron-right" />
      </button>
    </section>
    <div class="about">
      <span>Cinch · TDesign Mobile Vue</span><small>{{ t('subtitle') }}</small>
    </div>
    <t-button block variant="outline" theme="danger" @click="confirmLogout = true">{{
      t('logout')
    }}</t-button
    ><Sheet v-model="infoOpen" :title="t('profile')"
      ><dl class="details">
        <dt>{{ t('system.fields.username') }}</dt>
        <dd>{{ session.user?.username }}</dd>
        <dt>{{ t('system.fields.role') }}</dt>
        <dd>{{ session.user?.role?.name || '—' }}</dd>
        <dt>{{ t('system.fields.userCode') }}</dt>
        <dd>{{ session.user?.code }}</dd>
      </dl></Sheet
    ><Sheet v-model="passwordOpen" :before-close="beforeClose" :title="t('password')"
      ><form ref="formElement" novalidate @submit.prevent="submit">
        <Field
          name="old-password"
          :label="t('page.profile.password.oldPassword')"
          :error="errors.old"
          required
          ><t-input
            id="old-password"
            v-model="oldPassword"
            name="old_password"
            type="password"
            autocomplete="current-password" /></Field
        ><Field
          name="new-password"
          :label="t('page.profile.password.newPassword')"
          :error="errors.password"
          required
          ><t-input
            id="new-password"
            v-model="newPassword"
            name="new_password"
            type="password"
            autocomplete="new-password" /></Field
        ><Field
          name="confirm-password"
          :label="t('page.profile.password.confirmPassword')"
          :error="errors.confirmation"
          required
          ><t-input
            id="confirm-password"
            v-model="confirmation"
            name="confirm_password"
            type="password"
            autocomplete="new-password" /></Field
        ><Field
          v-if="captcha"
          name="password-captcha"
          :label="t('app.captcha.additional')"
          :error="errors.captcha"
          ><PointCaptcha
            v-model="points"
            :captcha="captcha"
            authenticated
            @update="captcha = $event"
        /></Field>
        <p v-if="error" role="alert" class="form-error">{{ error }}</p>
        <t-button block theme="primary" type="submit" :loading="busy">{{ t('save') }}</t-button>
      </form></Sheet
    ><Sheet v-model="confirmLogout" :title="t('logoutConfirm')"
      ><div class="sheet-actions">
        <t-button @click="confirmLogout = false">{{ t('cancel') }}</t-button
        ><t-button theme="danger" @click="logout">{{ t('logout') }}</t-button>
      </div></Sheet
    ><DiscardSheet v-model="discardOpen" @decide="decide" />
  </div>
</template>
