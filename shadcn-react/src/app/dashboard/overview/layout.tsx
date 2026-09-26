'use client';

import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  IconBell,
  IconCake,
  IconCreditCard,
  IconDownload,
  IconTrendingUp
} from '@tabler/icons-react';
import { useLocale } from '@/features/i18n/locale-context';
import type { ReactNode } from 'react';

const metrics = [
  {
    title: 'Users / 用户量',
    value: '2,000',
    total: '120,000',
    totalLabel: 'Total users / 总用户量',
    icon: IconCreditCard
  },
  {
    title: 'Visits / 访问量',
    value: '20,000',
    total: '500,000',
    totalLabel: 'Total visits / 总访问量',
    icon: IconCake
  },
  {
    title: 'Downloads / 下载量',
    value: '8,000',
    total: '120,000',
    totalLabel: 'Total downloads / 总下载量',
    icon: IconDownload
  },
  {
    title: 'Usage / 使用量',
    value: '5,000',
    total: '50,000',
    totalLabel: 'Total usage / 总使用量',
    icon: IconBell
  }
];

export default function OverviewLayout({
  sales,
  pie_stats,
  bar_stats,
  area_stats
}: {
  sales: ReactNode;
  pie_stats: ReactNode;
  bar_stats: ReactNode;
  area_stats: ReactNode;
}) {
  const { locale, pick } = useLocale();
  const localized = (value: string) => {
    const index = value.indexOf(' / ');
    return index < 0 ? value : locale === 'zh-CN' ? value.slice(index + 3) : value.slice(0, index);
  };
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>{pick('Overview', '数据概览')}</h2>
          <p className='text-sm text-muted-foreground'>
            {pick('Operational metrics and trends', '运营指标与趋势')}
          </p>
        </div>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {metrics.map((metric) => (
            <Card className='bg-gradient-to-t from-primary/5 to-card' key={metric.title}>
              <CardHeader>
                <CardDescription className='flex items-center gap-2'>
                  <metric.icon className='size-5 text-primary' />
                  {localized(metric.title)}
                </CardDescription>
                <CardTitle className='text-3xl tabular-nums'>{metric.value}</CardTitle>
              </CardHeader>
              <CardFooter className='flex justify-between text-xs'>
                <span className='text-muted-foreground'>{localized(metric.totalLabel)}</span>
                <Badge variant='outline'>
                  <IconTrendingUp />
                  {metric.total}
                </Badge>
              </CardFooter>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{pick('Traffic analysis', '流量分析')}</CardTitle>
            <CardDescription>
              {pick(
                'Switch between traffic trends and monthly visits',
                '切换查看流量趋势与月访问量'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue='trends'>
              <TabsList>
                <TabsTrigger value='trends'>{pick('Traffic trends', '流量趋势')}</TabsTrigger>
                <TabsTrigger value='visits'>{pick('Monthly visits', '月访问量')}</TabsTrigger>
              </TabsList>
              <TabsContent value='trends' className='mt-4'>
                {area_stats}
              </TabsContent>
              <TabsContent value='visits' className='mt-4'>
                {bar_stats}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
          <div>{pie_stats}</div>
          <div>{sales}</div>
        </div>
      </div>
    </PageContainer>
  );
}
