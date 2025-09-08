import express from 'express';
import authRoutes from './routes/authRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

const app = express();
app.use(express.json());

app.use(authRoutes);
app.use(settingsRoutes);

export default app;
