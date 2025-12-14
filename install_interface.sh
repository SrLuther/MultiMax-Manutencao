#!/usr/bin/env bash
set -euo pipefail

TARGET=/opt/mutimax-interface
DOMAIN=${DOMAIN:-interface.multimax.tec.br}
EMAIL=${LETSENCRYPT_EMAIL:-admin@"$DOMAIN"}
ADMIN_PASS_ENV=${ADMIN_PASS:-}

echo "[*] Detectando pacote do projeto"
SRC_DIR="$(pwd)"
PKG_DIR=""
INPUT="${1:-}"
if [[ -n "$INPUT" ]]; then
  if [[ "$INPUT" =~ ^https?:// ]]; then
    PKG_DIR="/tmp/mutimax-interface-pkg"
    rm -rf "$PKG_DIR"
    mkdir -p "$PKG_DIR"
    echo "[*] Baixando pacote de $INPUT"
    if [[ "$INPUT" == *.zip ]]; then
      TMP_ZIP="/tmp/mutimax-interface.zip"
      curl -L "$INPUT" -o "$TMP_ZIP"
      echo "[*] Instalando unzip (se necessário)"
      sudo apt-get update -y || true
      sudo apt-get install -y unzip || true
      unzip -o "$TMP_ZIP" -d "$PKG_DIR"
    elif [[ "$INPUT" == *.tar.gz || "$INPUT" == *.tgz ]]; then
      TMP_TAR="/tmp/mutimax-interface.tar.gz"
      curl -L "$INPUT" -o "$TMP_TAR"
      tar -xzf "$TMP_TAR" -C "$PKG_DIR"
    elif [[ "$INPUT" == https://github.com/*/* ]]; then
      REF="${GITHUB_REF:-main}"
      ZIP_URL="$INPUT/archive/refs/heads/$REF.zip"
      TMP_ZIP="/tmp/mutimax-interface.zip"
      echo "[*] Detectado repositório GitHub; baixando branch '$REF' de $ZIP_URL"
      curl -L "$ZIP_URL" -o "$TMP_ZIP"
      echo "[*] Instalando unzip (se necessário)"
      sudo apt-get update -y || true
      sudo apt-get install -y unzip || true
      unzip -o "$TMP_ZIP" -d "$PKG_DIR"
    else
      echo "[!] URL não reconhecida. Use um .zip, .tar.gz ou URL de repositório GitHub."
      exit 1
    fi
    SRC_DIR="$PKG_DIR"
  elif [[ "$INPUT" == *.tar.gz || "$INPUT" == *.tgz ]]; then
    PKG_DIR="/tmp/mutimax-interface-pkg"
    rm -rf "$PKG_DIR"
    mkdir -p "$PKG_DIR"
    echo "[*] Extraindo pacote $INPUT"
    tar -xzf "$INPUT" -C "$PKG_DIR"
    SRC_DIR="$PKG_DIR"
  elif [[ "$INPUT" == *.zip ]]; then
    PKG_DIR="/tmp/mutimax-interface-pkg"
    rm -rf "$PKG_DIR"
    mkdir -p "$PKG_DIR"
    echo "[*] Instalando unzip (se necessário)"
    sudo apt-get update -y || true
    sudo apt-get install -y unzip || true
    echo "[*] Extraindo pacote zip $INPUT"
    unzip -o "$INPUT" -d "$PKG_DIR"
    SRC_DIR="$PKG_DIR"
  else
    SRC_DIR="$INPUT"
  fi
fi

echo "[*] Atualizando pacotes"
sudo apt-get update -y
sudo apt-get install -y curl gnupg ca-certificates lsb-release

echo "[*] Instalando Node.js"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "[*] Instalando Nginx, UFW e Certbot"
sudo apt-get install -y nginx ufw certbot python3-certbot-nginx

echo "[*] Configurando firewall"
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw --force enable

echo "[*] Criando diretórios"
sudo mkdir -p "$TARGET"
sudo mkdir -p "$TARGET/logs/terminals" "$TARGET/logs/updates"

echo "[*] Validando origem em $SRC_DIR"
if [[ ! -d "$SRC_DIR/backend" || ! -d "$SRC_DIR/frontend" || ! -d "$SRC_DIR/systemd" ]]; then
  echo "[!] Estrutura inválida do projeto. Esperado subpastas: backend, frontend, systemd"
  exit 1
fi

echo "[*] Copiando projeto para $TARGET"
sudo cp -r "$SRC_DIR/backend" "$SRC_DIR/frontend" "$SRC_DIR/systemd" "$TARGET"/

echo "[*] Configurando .env.production"
ADMIN_PASS_GEN=$(openssl rand -base64 18 | tr -d '\n' || true)
ADMIN_PASS_FINAL=${ADMIN_PASS_ENV:-$ADMIN_PASS_GEN}
sudo bash -c "cat > '$TARGET/backend/.env.production' <<EOF
MODE=production
INTERFACE_PORT=8080
MUTIMAX_PATH=/opt/mutimax
LOG_PATH=/opt/mutimax-interface/logs
ADMIN_USER=admin
ADMIN_PASS=$ADMIN_PASS_FINAL
DOMAIN_TO_MONITOR=https://$DOMAIN
SFTP_ENABLED=false
MUTIMAX_SERVICE_NAME=mutimax
EOF"

echo "[*] Instalando dependências backend"
cd "$TARGET/backend"
sudo npm install --omit=dev

echo "[*] Build do frontend"
cd "$TARGET/frontend"
sudo npm install
sudo npm run build

echo "[*] Ajustando permissões"
sudo chown -R www-data:www-data "$TARGET"

echo "[*] Configurando systemd"
sudo cp "$TARGET/systemd/mutimax-interface.service" /etc/systemd/system/mutimax-interface.service
sudo systemctl daemon-reload
sudo systemctl enable mutimax-interface
sudo systemctl restart mutimax-interface

echo "[*] Configurando sudoers para controle do serviço mutimax"
sudo bash -c "cat > /etc/sudoers.d/mutimax-interface <<SUD
www-data ALL=(ALL) NOPASSWD:/bin/systemctl start mutimax, /bin/systemctl stop mutimax, /bin/systemctl restart mutimax, /bin/systemctl is-active mutimax
SUD"
sudo chmod 440 /etc/sudoers.d/mutimax-interface

echo "[*] Configurando Nginx"
sudo bash -c "cat > /etc/nginx/sites-available/mutimax-interface.conf <<CONF
server {
    listen 80;
    server_name $DOMAIN;
    location = /manutencao { return 301 /manutencao/; }
    location /manutencao/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /ws/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
CONF"
sudo ln -sf /etc/nginx/sites-available/mutimax-interface.conf /etc/nginx/sites-enabled/mutimax-interface.conf
sudo nginx -t
sudo systemctl reload nginx

echo "[*] Validando resolução DNS para $DOMAIN"
if getent hosts "$DOMAIN" >/dev/null; then
  echo "[*] Emitindo certificado TLS"
  sudo certbot --nginx -n --agree-tos -m "$EMAIL" -d "$DOMAIN" || true
else
  echo "[!] Domínio não resolve. Pulei emissão de certificado."
fi
sudo systemctl reload nginx

if [[ "${BLOCK_HTTP:-false}" == "true" ]]; then
  echo "[*] Bloqueando porta 80 e mantendo 443/22"
  sudo ufw deny 80 || true
fi

echo "[*] Serviço ativo e painel disponível em https://$DOMAIN/manutencao"
echo "[*] Usuário admin e senha definida. Para definir manualmente, execute: sudo systemctl stop mutimax-interface; edite $TARGET/backend/.env.production (ADMIN_PASS); sudo systemctl restart mutimax-interface"
echo "[*] Credenciais atuais:"
echo "    ADMIN_USER=admin"
echo "    ADMIN_PASS=$ADMIN_PASS_FINAL"
echo "[*] Painel: https://$DOMAIN/manutencao"
