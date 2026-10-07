import { useState, useEffect } from 'react';
import { db } from '@/services/firebase-services';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Star, MessageCircle, Clock, ShieldCheck, Loader2 } from 'lucide-react';
import { writeAuditEntry } from '@/services/audit-services';
import { AUDIT_ACTIONS } from '@/types/index';
import { toast } from 'sonner';

interface Review {
  id: string;
  guestName: string;
  category: string;
  rating: number;
  comments?: string;
  createdAt: string;
  managementResponse?: string;
}

export function ReviewManager() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Review[];
      setReviews(data);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching reviews:", error);
      setIsLoading(false);
      toast.error("Failed to load reviews");
    });
    return () => unsubscribe();
  }, []);

  const handleReplySubmit = async (reviewId: string) => {
    if (!replyText.trim()) return;
    setIsSubmitting(true);
    try {
      const reviewRef = doc(db, 'reviews', reviewId);
      await updateDoc(reviewRef, {
        managementResponse: replyText.trim()
      });
      const target = reviews.find((r) => r.id === reviewId);
      await writeAuditEntry({
        action: AUDIT_ACTIONS.reviewModerated,
        entity: 'reviews',
        entityId: reviewId,
        summary: `Management response published on ${target?.guestName || 'a'} review (${target?.rating ?? '-'}★)`,
        metadata: { category: target?.category ?? null, rating: target?.rating ?? null },
      });
      toast.success("Response submitted successfully");
      setReplyingTo(null);
      setReplyText('');
    } catch (error) {
      console.error("Error updating review:", error);
      toast.error("Failed to submit response");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-bold text-[#1e3a5f] dark:text-white mb-2">Guest Reviews Management</h2>
        <p className="text-gray-500 dark:text-gray-400">View and respond to guest feedback across all services.</p>
      </div>

      <div className="grid gap-4">
        {reviews.map(review => (
          <Card key={review.id} className="border-gray-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    {review.guestName}
                    <Badge variant="outline" className="text-xs uppercase bg-gray-50 dark:bg-slate-800">
                      {review.category}
                    </Badge>
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className={`h-3 w-3 ${s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 dark:text-slate-600'}`} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {review.comments ? (
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg">
                  "{review.comments}"
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic mt-3">No text provided, rating only.</p>
              )}

              {/* Management Response Section */}
              <div className="mt-4">
                {review.managementResponse ? (
                  <div className="bg-blue-50/50 dark:bg-blue-900/10 border-l-2 border-[#1e3a5f] dark:border-blue-500 p-3 rounded-r-lg">
                    <p className="text-xs font-bold text-[#1e3a5f] dark:text-blue-400 flex items-center gap-1 mb-1">
                      <ShieldCheck className="h-3 w-3" /> Management Response
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      "{review.managementResponse}"
                    </p>
                  </div>
                ) : (
                  <>
                    {replyingTo === review.id ? (
                      <div className="space-y-3 mt-4 border-t border-gray-100 dark:border-slate-800 pt-4">
                        <Textarea 
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write a professional response..."
                          className="min-h-[100px] text-sm bg-white dark:bg-slate-900"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(null); setReplyText(''); }}>
                            Cancel
                          </Button>
                          <Button 
                            size="sm" 
                            className="bg-[#1e3a5f] hover:bg-[#163058]"
                            onClick={() => handleReplySubmit(review.id)}
                            disabled={!replyText.trim() || isSubmitting}
                          >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Response'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-blue-600 border-blue-200 hover:bg-blue-50 mt-2"
                        onClick={() => { setReplyingTo(review.id); setReplyText(''); }}
                      >
                        <MessageCircle className="h-4 w-4 mr-2" /> Reply as Management
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {reviews.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No reviews found.
          </div>
        )}
      </div>
    </div>
  );
}
