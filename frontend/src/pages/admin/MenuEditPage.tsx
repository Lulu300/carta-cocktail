import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Cocktail, Menu, MenuCocktail } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import AddCocktailModal from '../../components/admin/menus/AddCocktailModal';
import MenuComposition from '../../components/admin/menus/MenuComposition';
import MenuEditorLayout from '../../components/admin/menus/MenuEditorLayout';
import MenuItemRow from '../../components/admin/menus/MenuItemRow';
import { groupBySection } from '../../components/admin/menus/groupBySection';
import { cocktailsEdits, useSaveMenuCocktails } from '../../components/admin/menus/useSaveMenuCocktails';

export default function MenuEditPage() {
  const { t } = useTranslation();
  const menuId = Number(useParams().id);

  return (
    <MenuEditorLayout menuId={menuId} itemLabel="cocktails" title={() => t('menus.edit')}>
      {(menu) => <MenuCocktails menu={menu} />}
    </MenuEditorLayout>
  );
}

/** The cocktails of the menu: every change is saved at once. */
function MenuCocktails({ menu }: { menu: Menu }) {
  const { t } = useTranslation();
  const save = useSaveMenuCocktails(menu.id);
  const [isAdding, setIsAdding] = useState(false);
  const cocktails = menu.cocktails ?? [];
  const sections = menu.sections ?? [];

  const add = (cocktail: Cocktail) => {
    setIsAdding(false);
    // The id comes with the server's answer; the editor never sends it.
    const added: MenuCocktail = {
      id: 0, menuId: menu.id, cocktailId: cocktail.id, cocktail, menuSectionId: null, position: cocktails.length, isHidden: false,
    };
    save.mutate(cocktailsEdits.add(added));
  };

  const nameOf = (item: MenuCocktail) => item.cocktail?.name ?? t('menus.cocktailFallback', { id: item.cocktailId });

  return (
    <Card as="section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{t('cocktails.title')}</h2>
        <Button variant="secondary" size="sm" onClick={() => setIsAdding(true)}>{t('menus.addCocktail')}</Button>
      </div>
      {cocktails.length === 0 ? (
        <p className="text-center py-8 text-fg-muted">{t('menus.noCocktails')}</p>
      ) : (
        <MenuComposition
          groups={groupBySection(cocktails, sections)}
          getKey={(item) => item.cocktailId}
          onReorder={(items) => save.mutate(cocktailsEdits.order(items.map((item) => item.cocktailId)))}
          renderItem={(item, move) => (
            <MenuItemRow
              label={nameOf(item)}
              isHidden={item.isHidden}
              onToggleHidden={() => save.mutate(cocktailsEdits.update(item.cocktailId, { isHidden: !item.isHidden }))}
              sections={sections}
              sectionId={item.menuSectionId}
              onSectionChange={(menuSectionId) => save.mutate(cocktailsEdits.update(item.cocktailId, { menuSectionId }))}
              move={move}
              onRemove={() => save.mutate(cocktailsEdits.remove(item.cocktailId))}
            >
              <span className="font-medium">{nameOf(item)}</span>
            </MenuItemRow>
          )}
        />
      )}
      <AddCocktailModal
        open={isAdding}
        onClose={() => setIsAdding(false)}
        excludedIds={cocktails.map((item) => item.cocktailId)}
        onAdd={add}
      />
    </Card>
  );
}
