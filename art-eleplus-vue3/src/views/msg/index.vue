<script setup lang="ts">
import {ref,watch,onActivated,onDeactivated} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import MessageTable from './MessageTable.vue'
import {$t} from '@/locales'
const router=useRouter(),route=useRoute(),open=ref(true)
watch(()=>route.path,path=>{open.value=path==='/msg/inbox'},{immediate:true,flush:'post'})
onActivated(()=>{open.value=true})
onDeactivated(()=>{open.value=false})
function closed(){if(route.path==='/msg/inbox')void router.replace('/dashboard/overview')}
</script>
<template><ElDialog v-model="open" :title="$t('msg.history')" fullscreen :show-close="false" destroy-on-close @closed="closed"><MessageTable v-if="open" embedded @close="open=false"/></ElDialog></template>
