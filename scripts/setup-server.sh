#!/bin/bash

echo "🚀 Iniciando configuração do servidor MapsProve..."

# Atualização do sistema
echo "📦 Atualizando pacotes..."
sudo apt update && sudo apt upgrade -y

# Instalando Node.js e npm
echo "📥 Instalando Node.js e npm..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificando versão
node -v && npm -v

# Instalando PostgreSQL
echo "🐘 Instalando PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Criando banco e usuário
echo "🛠️ Criando banco de dados e usuário..."
sudo -u postgres psql <<EOF
CREATE USER mapsprove_user WITH PASSWORD 'mapsprove_pass';
CREATE DATABASE mapsprove_db OWNER mapsprove_user;
EOF

# Instalando Nginx
echo "🌐 Instalando Nginx..."
sudo apt install -y nginx

# Instalando Git
echo "🐙 Instalando Git..."
sudo apt install -y git

# Instalando Docker e Docker Compose
echo "🐳 Instalando Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
sudo apt install -y docker-compose

# Adicionando usuário ao grupo docker
sudo usermod -aG docker $USER

# Criando estrutura de diretórios do projeto
echo "📁 Criando estrutura de diretórios..."
mkdir -p ~/mapsprove/{backend,frontend,database,scripts,docs,nginx}

echo "✅ Finalizado! Reinicie o terminal ou execute: newgrp docker"
