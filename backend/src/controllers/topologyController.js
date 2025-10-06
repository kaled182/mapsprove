// backend/src/controllers/topologyController.js
// Versão: mapsprove-beta.1.1.0.1

import * as model from '../models/topologyModel.js';
import {
  TopologyNodeSchema,
  TopologyLinkSchema,
} from '../schemas/topologySchemas.js';

// 🧠 NODES ===============================

export async function getAllNodes(req, res) {
  try {
    const filters = req.query; // Suporte a filtros futuros (status, tag, etc.)
    const nodes = await model.fetchAllNodes(filters);
    res.status(200).json(nodes);
  } catch (err) {
    console.error('[getAllNodes]', err);
    res.status(500).json({ error: 'Erro ao buscar nós.' });
  }
}

export async function getNodeById(req, res) {
  try {
    const { id } = req.params;
    const node = await model.fetchNodeById(id);

    if (!node) {
      return res.status(404).json({ error: 'Nó não encontrado.' });
    }

    res.status(200).json(node);
  } catch (err) {
    console.error('[getNodeById]', err);
    res.status(500).json({ error: 'Erro ao buscar nó.' });
  }
}

export async function createNode(req, res) {
  try {
    const parsed = TopologyNodeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
    }

    const newNode = await model.insertNode(parsed.data);
    res.status(201).json(newNode);
  } catch (err) {
    console.error('[createNode]', err);
    res.status(500).json({ error: 'Erro ao criar nó.' });
  }
}

// 🔗 LINKS ===============================

export async function getAllLinks(req, res) {
  try {
    const filters = req.query;
    const links = await model.fetchAllLinks(filters);
    res.status(200).json(links);
  } catch (err) {
    console.error('[getAllLinks]', err);
    res.status(500).json({ error: 'Erro ao buscar enlaces.' });
  }
}

export async function getLinkById(req, res) {
  try {
    const { id } = req.params;
    const link = await model.fetchLinkById(id);

    if (!link) {
      return res.status(404).json({ error: 'Enlace não encontrado.' });
    }

    res.status(200).json(link);
  } catch (err) {
    console.error('[getLinkById]', err);
    res.status(500).json({ error: 'Erro ao buscar enlace.' });
  }
}

export async function createLink(req, res) {
  try {
    const parsed = TopologyLinkSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
    }

    const newLink = await model.insertLink(parsed.data);
    res.status(201).json(newLink);
  } catch (err) {
    console.error('[createLink]', err);
    res.status(500).json({ error: 'Erro ao criar enlace.' });
  }
}

// Os métodos update/delete virão em seguida
