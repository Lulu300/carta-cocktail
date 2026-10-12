import { useParams } from 'react-router-dom';
import CocktailForm from '../../components/admin/cocktails/CocktailForm';

/**
 * `/admin/cocktails/new` and `/admin/cocktails/:id` render this page at the same
 * place, so React would keep the form state from one to the other: the key
 * mounts a fresh form for each cocktail.
 */
export default function CocktailFormPage() {
  const { id } = useParams();
  return <CocktailForm key={id ?? 'new'} id={id === undefined ? undefined : Number(id)} />;
}
