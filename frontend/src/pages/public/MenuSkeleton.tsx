import Skeleton from '../../components/ui/Skeleton';
import PublicLoading from './PublicLoading';

const PLACEHOLDER_CARDS = [1, 2, 3, 4];

/** Shape of a cocktail menu while it loads: title, search bar and four cards. */
export default function MenuSkeleton() {
  return (
    <PublicLoading className="max-w-4xl mx-auto px-4 py-8">
      <Skeleton className="h-10 w-2/3 sm:w-1/2 mx-auto mb-8" />
      <Skeleton className="h-12 w-full mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLACEHOLDER_CARDS.map((card) => (
          <div key={card} className="bg-surface border border-line rounded-xl overflow-hidden">
            <Skeleton className="aspect-video rounded-none" />
            <div className="p-5 space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </PublicLoading>
  );
}
