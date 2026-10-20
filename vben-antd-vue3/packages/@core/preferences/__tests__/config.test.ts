import { describe, expect, it } from 'vitest';

import { defaultPreferences } from '../src/config';

describe('defaultPreferences immutability test', () => {
  // 创建快照，确保默认配置对象不被修改
  it('should not modify the config object', () => {
    expect(defaultPreferences.copyright.date).toBe(
      String(new Date().getFullYear()),
    );
    expect(defaultPreferences).toMatchSnapshot({
      copyright: { date: expect.any(String) },
    });
  });
});
