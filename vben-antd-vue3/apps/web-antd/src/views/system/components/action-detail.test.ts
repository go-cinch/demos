import { mount } from '@vue/test-utils';

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { actionEditorName, loadActionRecord } from './action-detail';
import { canManageDefinition } from './assignment-policy';
import SystemRecordDetail from './system-record-detail.vue';
import { buildChangedPayload, snapshotPayload } from './update-payload';

const { getAction } = vi.hoisted(() => ({ getAction: vi.fn() }));

vi.mock('#/api/system', () => ({ getAction }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
}));
vi.mock('./permission-detail.vue', () => ({ default: { props: ['actions', 'codes'], template: '<div data-testid="permission-detail" />' } }));
vi.mock('./group-members.vue', () => ({
  default: { template: '<div />' },
}));

dayjs.extend(utc);
dayjs.extend(timezone);

describe('action detail field selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows wildcard mappings compactly while retaining definition metadata for publishers', async () => {
    getAction.mockResolvedValue({
      id: 7,
      created_at: 1_792_287_000_000,
      updated_at: 1_792_287_060_000,
      code: 'USERREAD',
      name: 'Read users',
      group: 'admin:system:user',
      word: 'admin:read:system:user',
      config: { permission_scope: '*', ui: [], endpoints: [] },
      resource: 'GET|/user',
      menu: '/system/user',
      button: 'admin:btn:system:user:query',
    });

    const record = await loadActionRecord(7);
    const wrapper = mount(SystemRecordDetail, {
      props: { resource: 'action', record },
    });
    try {
      expect(getAction).toHaveBeenCalledWith(7, {
        f: 'id,created_at,updated_at,code,name,group,word,config,resource,menu,button',
      });
      for (const text of [
        'Read users',
        'USERREAD',
        'admin:system:user',
        'admin:read:system:user',
      ]) {
        expect(wrapper.text()).toContain(text);
      }
      expect(wrapper.findAll('.detail-rule')).toHaveLength(0);
      expect(wrapper.find('[data-testid="permission-detail"]').exists()).toBe(true);
      expect(wrapper.text()).not.toContain('/system/user');
      expect(wrapper.text()).not.toContain('admin:btn:system:user:query');
      expect(record).toMatchObject({ resource: 'GET|/user', menu: '/system/user' });
      expect(wrapper.get('.detail-metadata').text()).toContain(
        dayjs(1_792_287_000_000)
          .tz('Asia/Shanghai')
          .format('YYYY-MM-DD HH:mm:ss'),
      );
      expect(record).not.toHaveProperty('names');
      expect(canManageDefinition(record.word, record.config?.builtin, false, true, record.config?.permission_scope)).toBe(true);
      expect(canManageDefinition(record.word, record.config?.builtin, false, false, record.config?.permission_scope)).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it('hydrates all editable fields without loading display projections', async () => {
    const definition = {
      id: 7,
      name: 'Read users',
      names: { 'en-US': 'Read users', 'zh-CN': '查看用户' },
      group: 'admin:system:user',
      word: 'admin:read:system:user',
      scope: 'admin',
      config: {
        bindings: [
          {
            resource_key: 'admin:system:user',
            operation: 'read',
            feature_keys: [],
          },
        ],
        ui: [],
        endpoints: [],
      },
    };
    getAction.mockResolvedValue(definition);

    const record = await loadActionRecord(7, 'edit');
    expect(getAction).toHaveBeenCalledWith(7, {
      f: 'id,name,names,group,word,scope,config',
    });
    const fields = ['word', 'names', 'group', 'config'];
    const initial = snapshotPayload({ ...record }, fields);
    expect(initial).toEqual({
      word: definition.word,
      names: definition.names,
      group: definition.group,
      config: definition.config,
    });
    expect(
      buildChangedPayload(initial, snapshotPayload({ ...record }, fields)),
    ).toEqual({});
    expect(
      buildChangedPayload(initial, {
        ...initial,
        group: 'admin:system:people',
      }),
    ).toEqual({ group: 'admin:system:people' });
    expect(record).not.toHaveProperty('resource');
    expect(record).not.toHaveProperty('created_at');
  });

  it('uses the binding-based backend name for a custom word without translations', () => {
    const word = 'admin:read:custom:review';
    expect(actionEditorName(word, {}, 'en-US', 'en-US', 'Read invoices')).toBe(
      'Read invoices',
    );
    expect(
      actionEditorName(
        word,
        { 'zh-CN': '审核账单', 'en-US': 'Review bills' },
        'zh-CN',
        'en-US',
        'Read invoices',
      ),
    ).toBe('审核账单');
    expect(
      actionEditorName(
        word,
        { 'en-US': 'Review bills' },
        'zh-CN',
        'en-US',
        'Read invoices',
      ),
    ).toBe('Review bills');
    expect(actionEditorName(word, {}, 'en-US', 'en-US')).toBe(word);
  });

  it('retains reserved definition restrictions while allowing catalog publishers', () => {
    expect(
      canManageDefinition('admin:all:system:all', undefined, false, true, '*'),
    ).toBe(true);
    expect(
      canManageDefinition(
        'admin:default:system:default',
        'default',
        false,
        false,
      ),
    ).toBe(false);
    expect(
      canManageDefinition(
        'admin:default:system:default',
        'default',
        false,
        true,
      ),
    ).toBe(true);
  });

});
