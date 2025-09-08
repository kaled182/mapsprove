import express from 'express';
import settingsRoutes from './routes/settingsRoutes.js';

const app = express();
app.use(express.json());

// ...suas outras rotas
app.use(settingsRoutes);

export default app;
