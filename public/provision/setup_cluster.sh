#!/bin/sh
#wait until another process are trying updating the system
while sudo fuser /var/{lib/{dpkg,apt/lists},cache/apt/archives}/lock >/dev/null 2>&1; do sleep 1; done
while sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do sleep 1; done

DEBIAN_FRONTEND=noninteractive  sudo apt-get update
DEBIAN_FRONTEND=noninteractive  sudo apt-get install -y npm
npm install pm2@latest -g

ssh-keygen -t rsa -q -f "$HOME/.ssh/id_rsa" -N ""

ssh-keyscan bitbucket.org >> ~/.ssh/known_hosts
ssh-keyscan github.com >> ~/.ssh/known_hosts

mkdir /root/.deployed
mv /root/cluster_config.json /root/.deployed/config.json

while sudo fuser /var/{lib/{dpkg,apt/lists},cache/apt/archives}/lock >/dev/null 2>&1; do sleep 1; done

DEBIAN_FRONTEND=noninteractive sudo apt-get update
DEBIAN_FRONTEND=noninteractive sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo \
  "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  while sudo fuser /var/{lib/{dpkg,apt/lists},cache/apt/archives}/lock >/dev/null 2>&1; do sleep 1; done


DEBIAN_FRONTEND=noninteractive sudo apt-get update
DEBIAN_FRONTEND=noninteractive sudo apt-get install -y docker-ce docker-ce-cli containerd.io

while sudo fuser /var/{lib/{dpkg,apt/lists},cache/apt/archives}/lock >/dev/null 2>&1; do sleep 1; done


DEBIAN_FRONTEND=noninteractive sudo apt-get install -y haproxy
mkdir /etc/haproxy/certs
rm /etc/haproxy/haproxy.cfg
mv /root/haproxy.cfg /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy

git clone https://bitbucket.org/coded-sh/dep-cluster.git
cd dep-cluster
npm install
pm2 start index.js --name "dep-cluster"

while sudo fuser /var/{lib/{dpkg,apt/lists},cache/apt/archives}/lock >/dev/null 2>&1; do sleep 1; done


DEBIAN_FRONTEND=noninteractive apt-get install -y snapd
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

certbot certonly --non-interactive --agree-tos -m dev@{{domain}} --webroot -w /root/dep-cluster/certs -d {{cluster_id}}.{{domain}}
DOMAIN='{{cluster_id}}.{{domain}}' sudo -E bash -c 'cat /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/letsencrypt/live/$DOMAIN/privkey.pem > /etc/haproxy/certs/$DOMAIN.pem'

rm /etc/haproxy/haproxy.cfg
mv /root/haproxy-ssl.cfg /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy

curl -d '{"pub_key":"'"$(cat /root/.ssh/id_rsa.pub)"'","cluster_id":"{{cluster_parse_obj_id}}"}'  -H "authorization:{{token}}" -H "Content-Type: application/json" -X POST {{url}}/cluster-ready
