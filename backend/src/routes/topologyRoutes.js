// backend/src/routes/topologyRoutes.js
// Versão: mapsprove-beta.1.1.0.1
import express from 'express';
import {
  getAllNodes,
  getNodeById,
  createNode,
  updateNode,
  deleteNode,
  getAllLinks,
  getLinkById,
  createLink,
  updateLink,
  deleteLink,
} from '../controllers/topologyController.js';

const router = express.Router();

// 🧠 Rotas de Nós (Nodes)
router.get('/nodes', getAllNodes);         // Listar todos os nós (com filtros futuros)
router.get('/nodes/:id', getNodeById);     // Detalhes de um nó
router.post('/nodes', createNode);         // Criar novo nó
router.put('/nodes/:id', updateNode);      // Atualizar dados de um nó
router.delete('/nodes/:id', deleteNode);   // Excluir nó

// 🔗 Rotas de Enlaces (Links)
router.get('/links', getAllLinks);         // Listar todos os enlaces (com filtros futuros)
router.get('/links/:id', getLinkById);     // Detalhes de um enlace
router.post('/links', createLink);         // Criar novo enlace
router.put('/links/:id', updateLink);      // Atualizar dados de um enlace
router.delete('/links/:id', deleteLink);   // Excluir enlace

export default router;
