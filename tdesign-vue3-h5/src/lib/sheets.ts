import { shallowReactive } from 'vue';
export const sheetStack = shallowReactive<symbol[]>([]);
