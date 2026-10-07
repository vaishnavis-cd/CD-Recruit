import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { truncateId } from '@/lib/utils';
import type { BillingAccountDetail } from '@/lib/api/billing/types';

interface AccountOrganizationsTabProps {
  organizations: BillingAccountDetail['organizations'];
}

export const AccountOrganizationsTab: React.FC<AccountOrganizationsTabProps> = ({ organizations = [] }) => {
  if (organizations.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl">
        <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-white mb-1">No Organizations Bound</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          No tenant or organization accounts are currently associated with this commercial billing account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Linked Organizations ({organizations.length})</h3>
          <p className="text-xs text-slate-400">
            Entities sharing this pool of credits and governed by this billing account.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {organizations.map((org, index) => (
          <div
            key={org.id}
            className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col justify-between hover:border-slate-700/80 transition"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Building2 className="w-5 h-5" />
                </div>
                {index === 0 && (
                  <span className="text-[10px] uppercase font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                    Primary
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-white">{org.name}</h4>
                <p className="font-mono text-xs text-slate-400 mt-0.5">
                  ID: {truncateId(org.id, 10, 8)}
                </p>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800/80">
              <Link to={`/tenants/${org.id}`}>
                <Button size="sm" variant="ghost" className="w-full text-xs justify-between">
                  <span>View Tenant 360</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
