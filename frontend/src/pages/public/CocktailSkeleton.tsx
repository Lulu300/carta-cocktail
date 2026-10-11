import Skeleton from '../../components/ui/Skeleton';
import PublicLoading from './PublicLoading';

const PLACEHOLDER_LINES = [1, 2, 3];

/** Shape of a recipe card while it loads: image, title, ingredients and steps. */
export default function CocktailSkeleton() {
  return (
    <PublicLoading className="max-w-2xl mx-auto px-4 py-8">
      <Skeleton className="h-5 w-32 mb-6" />
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <Skeleton className="aspect-video rounded-none" />
        <div className="p-5 sm:p-8 space-y-4">
          <Skeleton className="h-9 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
          {PLACEHOLDER_LINES.map((line) => (
            <Skeleton key={line} className="h-4 w-2/3" />
          ))}
        </div>
      </div>
    </PublicLoading>
  );
}
