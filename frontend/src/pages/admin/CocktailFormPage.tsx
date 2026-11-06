import { useParams } from 'react-router-dom';
import CocktailForm from '../../components/admin/cocktails/CocktailForm';
import { useCocktailFormKey } from '../../components/admin/cocktails/useCocktailFormKey';

/**
 * `/admin/cocktails/new` and `/admin/cocktails/:id` render this page at the same
 * place, so React would keep the form state from one to the other: the key
 * mounts a fresh form for each cocktail.
 */
export default function CocktailFormPage() {
  const { id } = useParams();
  const formKey = useCocktailFormKey();
  return <CocktailForm key={formKey} id={id === undefined ? undefined : Number(id)} />;
}
