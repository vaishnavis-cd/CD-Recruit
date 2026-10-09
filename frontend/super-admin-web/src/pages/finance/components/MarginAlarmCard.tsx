import React from 'react';
import { AlertTriangle, CheckCircle2, Cpu } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

interface MarginAlarmCardProps {
  aiCostPercentage?: number;
  totalAiCostMinor?: number;
  totalRevenueMinor?: number;
}

export const MarginAlarmCard: React.FC<MarginAlarmCardProps> = ({
  aiCostPercentage = 16.4,
  totalAiCostMinor = 984000,
  totalRevenueMinor = 6000000,
}) => {
  const isAlarm = aiCostPercentage > 25.0;

  return (
    <Card
      className={
        isAlarm
          ? 'border-[#fecdca] bg-[#fef3f2] shadow-sm animate-pulse'
          : 'border-[#e8ecf4] bg-white'
      }
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900">
          <Cpu className="w-4 h-4 text-[#2f68ff]" /> Proctor AI Margin Guardrail
        </CardTitle>
        {isAlarm ? (
          <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-[#f04438] bg-[#fee4e2] border border-[#fecdca] px-2 py-0.5 rounded-full animate-bounce">
            <AlertTriangle className="w-3 h-3" /> MARGIN ALARM ACTIVE
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-[#12b76a] bg-[#ecfdf3] border border-[#a6f4c5] px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Margin Safe (&lt;25%)
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-500 block">
              AI Infrastructure Cost Share
            </span>
            <span
              className={`text-2xl font-bold font-mono ${
                isAlarm ? 'text-[#f04438]' : 'text-slate-900'
              }`}
            >
              {aiCostPercentage.toFixed(1)}%
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">
              Hard SLA Ceiling
            </span>
            <span className="text-sm font-mono font-bold text-slate-700">25.0%</span>
          </div>
        </div>

        {/* Bar */}
        <div className="space-y-1">
          <div className="h-2.5 w-full bg-[#f1f5f9] rounded-full overflow-hidden border border-[#e2e8f0]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isAlarm ? 'bg-[#f04438]' : aiCostPercentage > 20 ? 'bg-[#f79009]' : 'bg-[#12b76a]'
              }`}
              style={{ width: `${Math.min(100, (aiCostPercentage / 30) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>0%</span>
            <span>Target: 15%</span>
            <span>Limit: 25%</span>
            <span>30%</span>
          </div>
        </div>

        {isAlarm && (
          <div className="p-3 bg-[#fef3f2] border border-[#fecdca] rounded-xl space-y-2 text-xs text-[#f04438]">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-[#f04438]" />
              Margin degradation exceeds 25% threshold!
            </p>
            <p className="text-[11px] text-[#d92d20] leading-relaxed">
              Automated throttle recommendation: Switch non-priority drives to batch AI proctoring or reduce webcam frame rate from 2fps to 1fps.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
