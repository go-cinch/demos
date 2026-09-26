'use client';

import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/features/auth/auth-context';
import { useLocale } from '@/features/i18n/locale-context';
import {
  IconBrandGithub,
  IconBrandReact,
  IconBrandTypescript,
  IconDashboard,
  IconSettings,
  IconUsers
} from '@tabler/icons-react';
import Link from 'next/link';
import * as React from 'react';

const projects = [
  {
    name: 'GitHub',
    icon: IconBrandGithub,
    text: ['Open source collaboration and source code', '开源协作与源代码']
  },
  {
    name: 'React',
    icon: IconBrandReact,
    text: ['Component-driven user interfaces', '组件驱动的用户界面']
  },
  {
    name: 'TypeScript',
    icon: IconBrandTypescript,
    text: ['Typed application development', '类型安全的应用开发']
  }
];
const todos = [
  ['Review authentication logs', '检查认证日志'],
  ['Audit system permissions', '审计系统权限'],
  ['Update service dependencies', '更新服务依赖'],
  ['Verify account security', '检查账户安全']
];

export default function WorkspacePage() {
  const { user } = useAuth();
  const [done, setDone] = React.useState<number[]>([1]);
  const { pick } = useLocale();
  return (
    <PageContainer
      pageTitle={pick(`Hello, ${user?.username ?? ''} 👋`, `你好，${user?.username ?? ''} 👋`)}
      pageDescription={pick('A new day of secure administration', '开启安全管理的新一天')}
    >
      <div className='grid gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>{pick('Projects', '项目')}</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3 sm:grid-cols-3'>
            {projects.map((project) => (
              <div key={project.name} className='rounded-lg border p-4'>
                <project.icon className='mb-3 size-7 text-primary' />
                <div className='font-medium'>{project.name}</div>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {pick(project.text[0], project.text[1])}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{pick('Quick navigation', '快捷导航')}</CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-2 gap-2'>
            <Link
              className='rounded-md border p-3 text-sm hover:bg-muted'
              href='/dashboard/overview'
            >
              <IconDashboard className='mb-2 size-5' />
              {pick('Dashboard', '概览')}
            </Link>
            <Link className='rounded-md border p-3 text-sm hover:bg-muted' href='/system/user'>
              <IconUsers className='mb-2 size-5' />
              {pick('Users', '用户管理')}
            </Link>
            <Link className='rounded-md border p-3 text-sm hover:bg-muted' href='/system/role'>
              <IconSettings className='mb-2 size-5' />
              {pick('Roles', '角色管理')}
            </Link>
          </CardContent>
        </Card>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>{pick('Todo', '待办')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {todos.map((todo, index) => (
              <label key={todo[0]} className='flex items-center gap-3 rounded-md border p-3'>
                <Checkbox
                  checked={done.includes(index)}
                  onCheckedChange={(checked) =>
                    setDone((old) =>
                      checked ? [...old, index] : old.filter((item) => item !== index)
                    )
                  }
                />
                <span className={done.includes(index) ? 'text-muted-foreground line-through' : ''}>
                  {pick(todo[0], todo[1])}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{pick('Stats', '统计')}</CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-3 gap-2 text-center'>
            <div>
              <div className='text-2xl font-semibold'>{done.length}</div>
              <div className='text-xs text-muted-foreground'>{pick('Done', '已完成')}</div>
            </div>
            <div>
              <div className='text-2xl font-semibold'>8</div>
              <div className='text-xs text-muted-foreground'>{pick('Projects', '项目')}</div>
            </div>
            <div>
              <div className='text-2xl font-semibold'>300</div>
              <div className='text-xs text-muted-foreground'>{pick('Team', '团队')}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
