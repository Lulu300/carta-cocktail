/*
 * The tools of the MCP server: a short list of the tasks an agent needs, each one an operation
 * of the API named by its operationId. Only the name, the wording and the hints are written
 * here: the schemas, the method and the path come from the route (operationTools.ts), and the
 * route does the work, with its validation, scope checks and limits.
 *
 * Deliberately left out (decision of 2026-11-27): every deletion, the backup restore and
 * "log out everywhere". No tool may call a DELETE route (operationTools.test.ts).
 */

/** The hints of a tool that do not follow from its method (MCP `ToolAnnotations`). */
export interface ToolHints {
  /** The tool writes nothing, although its method is not a read (an import preview). */
  readOnlyHint?: boolean;
  /** The tool can replace data it is not given back, such as the whole list of a menu. */
  destructiveHint?: boolean;
}

export interface ToolDefinition {
  /** snake_case, as MCP clients and models expect. */
  name: string;
  /** The API operation the tool calls. */
  operationId: string;
  title: string;
  /** What the tool does, when to use it, and an example of arguments. In English. */
  description: string;
  hints?: ToolHints;
}

export const TOOL_CATALOG: ToolDefinition[] = [
  {
    name: 'list_cocktails',
    operationId: 'listCocktails',
    title: 'List cocktails',
    description:
      'Every cocktail with its recipe (ingredient lines, instructions, tags), sorted by name. Use it to find the id of a cocktail. Example: {}',
  },
  {
    name: 'get_cocktail',
    operationId: 'getCocktail',
    title: 'Get a cocktail',
    description: 'One cocktail with its recipe. Example: {"id": 12}',
  },
  {
    name: 'list_cocktail_availability',
    operationId: 'listCocktailAvailabilities',
    title: 'Which cocktails can be made',
    description:
      'For every cocktail, keyed by cocktail id: whether the stock allows it, how many servings, and each ingredient line with `isAvailable` (the missing ones are false) and the resources running low. Example: {}',
  },
  {
    name: 'get_cocktail_availability',
    operationId: 'getCocktailAvailability',
    title: 'Can a cocktail be made',
    description:
      'Whether the stock allows one cocktail, how many servings, and which ingredient lines are missing. Example: {"id": 12}',
  },
  {
    name: 'list_shortages',
    operationId: 'listShortages',
    title: 'List shortages',
    description:
      'The bottle categories below their desired stock, with the stock left (sum of the remaining percentages of their bottles) and the stock required. Use it to build a shopping list. Example: {}',
  },
  {
    name: 'list_bottles',
    operationId: 'listBottles',
    title: 'List bottles',
    description:
      'The bottles in stock with their category and remaining percentage, optionally filtered by category id or category type (SPIRIT, SYRUP, SOFT or a custom type). Example: {"type": "SPIRIT"}',
  },
  {
    name: 'get_bottle',
    operationId: 'getBottle',
    title: 'Get a bottle',
    description: 'One bottle with its category. Example: {"id": 5}',
  },
  {
    name: 'list_categories',
    operationId: 'listCategories',
    title: 'List bottle categories',
    description:
      'The bottle categories (rum, gin, syrup…) with their type and number of bottles. A recipe line can use any bottle of a category. Example: {}',
  },
  {
    name: 'list_ingredients',
    operationId: 'listIngredients',
    title: 'List ingredients',
    description:
      'The ingredients that are not bottles (garnishes, fresh items), with whether they are available. Example: {}',
  },
  {
    name: 'list_units',
    operationId: 'listUnits',
    title: 'List units',
    description:
      'The measurement units of recipe lines (cl, ml, dash…) with their conversion to ml. Use it to find the `unitId` of a recipe line. Example: {}',
  },
  {
    name: 'list_menus',
    operationId: 'listMenus',
    title: 'List menus',
    description:
      'Every menu with its type (COCKTAILS, APEROS, DIGESTIFS), whether it is published (`isPublic`) and its number of cocktails and bottles. Example: {}',
  },
  {
    name: 'get_menu',
    operationId: 'getMenu',
    title: 'Get a menu',
    description:
      'One menu with its sections, cocktails and bottles, hidden ones included. Read it before `update_menu`, which replaces whole lists. Example: {"id": 3}',
  },
  {
    name: 'update_bottle',
    operationId: 'updateBottle',
    title: 'Update a bottle',
    description:
      'Changes the fields given, and only those: most often the stock left (`remainingPercent`, 0 to 100). The aperitif and digestif menus follow `isApero` and `isDigestif`. Example: {"id": 5, "remainingPercent": 40}',
  },
  {
    name: 'create_cocktail',
    operationId: 'createCocktail',
    title: 'Create a cocktail',
    description:
      'Creates a cocktail and its recipe. Each ingredient line points to a bottle, a bottle category or an ingredient (`sourceType` BOTTLE, CATEGORY or INGREDIENT, with the matching id) and a unit (`list_units`). Example: {"name": "Daiquiri", "tags": ["classic"], "ingredients": [{"sourceType": "CATEGORY", "categoryId": 2, "quantity": 6, "unitId": 1}, {"sourceType": "INGREDIENT", "ingredientId": 4, "quantity": 2, "unitId": 1}], "instructions": ["Shake with ice", "Strain into a chilled glass"]}',
  },
  {
    name: 'update_cocktail',
    operationId: 'updateCocktail',
    title: 'Update a cocktail',
    description:
      'Changes the fields given, and only those. `ingredients` and `instructions` replace the whole stored lists: send every line, read them first with `get_cocktail`. `isAvailable` is the manual switch of the public menus. Example: {"id": 12, "isAvailable": false}',
    hints: { destructiveHint: true },
  },
  {
    name: 'update_menu',
    operationId: 'updateMenu',
    title: 'Update or publish a menu',
    description:
      'Changes the fields given, and only those. `isPublic` publishes or unpublishes the menu. `cocktails` (or `bottles`, on a personal bottle menu) replaces the whole list of the menu: to add or remove one, read the menu with `get_menu` and send the full new list. The bottles of the aperitif and digestif menus follow their flags: use `exclude_menu_bottles` there. Example: {"id": 3, "isPublic": true, "cocktails": [{"cocktailId": 12}, {"cocktailId": 7, "isHidden": true}]}',
    hints: { destructiveHint: true },
  },
  {
    name: 'exclude_menu_bottles',
    operationId: 'excludeMenuBottles',
    title: 'Remove bottles from a system menu',
    description:
      'Removes bottles from the aperitif or digestif menu, which keeps them out until `restore_menu_bottles`: the bottles themselves stay in stock. Example: {"menuId": 1, "bottleIds": [5, 8]}',
  },
  {
    name: 'restore_menu_bottles',
    operationId: 'restoreMenuBottles',
    title: 'Put bottles back in a system menu',
    description:
      'Puts back, at the end of the aperitif or digestif menu, bottles removed by `exclude_menu_bottles`. Example: {"menuId": 1, "bottleIds": [5]}',
  },
  {
    name: 'preview_cocktail_import',
    operationId: 'previewCocktailImport',
    title: 'Preview a cocktail import',
    description:
      'Reads a cocktail file (the JSON of a cocktail export, version 1) and tells, for each bottle, category, ingredient and unit it names, whether it already exists. Nothing is written. Example: {"version": 1, "cocktail": {"name": "Negroni", "ingredients": [{"sourceType": "CATEGORY", "sourceName": "Gin", "quantity": 3, "unit": {"abbreviation": "cl"}}]}}',
    hints: { readOnlyHint: true },
  },
];
