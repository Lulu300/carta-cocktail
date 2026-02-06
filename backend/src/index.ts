import app from './app';
import { config } from './config';

app.listen(config.port, () => {
  console.log(`🍸 Carta Cocktail API running on port ${config.port}`);
});
