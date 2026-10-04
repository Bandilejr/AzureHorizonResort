// NPO portal page wrapper: resolves the signed-in rep's npoId via contact email.
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { listenNpoPartners } from '@/services/increment2-services';
import { NpoPortal } from '@/components/npo/NpoPortal';
import { useAuth } from '@/hooks/useAuth';

export function NpoPortalPage() {
  const { user } = useAuth();
  const [npoId, setNpoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = listenNpoPartners((list) => {
      const mine = list.find(
        (n) => n.verificationStatus === 'approved' && n.email.toLowerCase() === (user?.email || '').toLowerCase()
      );
      setNpoId(mine ? mine.npoId : null);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.email]);

  if (loading) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading NPO portal…</div>;
  if (!npoId)
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <h1 className="text-xl font-bold text-[#1e3a5f]">NPO Portal</h1>
        <p className="text-sm text-slate-500 mt-2">No approved NPO is linked to {user?.email || 'this account'} yet. Your organisation must be verified by an administrator first.</p>
      </div>
    );
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <NpoPortal npoId={npoId} />
    </div>
  );
}
