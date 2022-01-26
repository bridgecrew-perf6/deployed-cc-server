/*
    provision.js
    Methods for provisioning new servers
*/
const fs = require('fs')
const { NodeSSH } = require('node-ssh')

const exec = require('child_process').exec;
const domain = process.env.SERVER_DOMAIN;

var is_cluster_installing = false;
var clusters_to_install = [];

function provisionNextClient() {
    if (clusters_to_install.length > 0 && is_cluster_installing == false) {
        is_cluster_installing = true;
        const next_cluster = clusters_to_install[0];
        console.log('==========================');
        console.log(`Provisioning next client, ${clusters_to_install.length - 1} clients are still in query to provision`);
        console.log(next_cluster);
        console.log('==========================');
        clusterProvision(next_cluster);
    }
}

function clusterProvision(next_cluster) {
    const ip = next_cluster.parse_obj.get("ip");
    const cluster_id = next_cluster.parse_obj.id.toLowerCase();
    var cluster_parse_obj = next_cluster.parse_obj;
    const logged_user = next_cluster.user;

    //Try to ssh to the new cluster
    var ssh = new NodeSSH();
    next_cluster.ssh = ssh;
    ssh.connect({
        host: ip,
        username: 'root',
        privateKey: `${require('os').homedir()}/.ssh/id_rsa`
    }).then(function () {

        //Create haproxy.cfg from a template
        var haproxy_cfg = '';
        try {
            haproxy_cfg = fs.readFileSync('./public/templates/haproxy.cfg', 'utf8');
        } catch (e) {
            console.log('Cannot load HAProxy config:', e.stack);
        }
        haproxy_cfg = haproxy_cfg.replace(/{{cluster_id}}/g, cluster_id);
        haproxy_cfg = haproxy_cfg.replace(/{{domain}}/g, domain);
        fs.writeFileSync(`./public/templates/${cluster_id}_haproxy.cfg`, haproxy_cfg);
        haproxy_cfg = haproxy_cfg.replace('#bind *:443 ssl', 'bind *:443 ssl');
        haproxy_cfg = haproxy_cfg.replace('#redirect scheme', 'redirect scheme');
        fs.writeFileSync(`./public/templates/${cluster_id}_haproxy-ssl.cfg`, haproxy_cfg);

        //Create provision script & haproxy.cfg from a template
        var provision_script = '';
        try {
            provision_script = fs.readFileSync('./public/provision/setup_cluster.sh', 'utf8');
        } catch (e) {
            console.log('Cannot load HAProxy config:', e.stack);
        }
        provision_script = provision_script.replace(/{{cluster_id}}/g, cluster_id);
        provision_script = provision_script.replace(/{{cluster_parse_obj_id}}/g, cluster_parse_obj.id);
        provision_script = provision_script.replace(/{{token}}/g, logged_user.sessionToken);
        provision_script = provision_script.replace(/{{url}}/g, process.env.DEPLOYED_CC_SERVER_API_ENDPOINT);
        provision_script = provision_script.replace(/{{domain}}/g, domain);

        //ToDo
        //save keys from user's object - logged_user
        //if user hasnt keys yet - generate them here and upload

        fs.writeFileSync(`./public/provision/${cluster_id}_setup_cluster.sh`, provision_script);

        //Create cluster config file
        var cluster_config = {};
        cluster_config.hook_key = cluster_parse_obj.get("hook_key");
        cluster_config.notification_key = cluster_parse_obj.get("notification_key");
        cluster_config.cluster_id = cluster_parse_obj.id;

        fs.writeFileSync(`./public/provision/${cluster_id}_cluster_config.json`, JSON.stringify(cluster_config));

        ssh.putFiles([{ local: `./public/provision/${cluster_id}_cluster_config.json`, remote: '/root/cluster_config.json' }, { local: `./public/provision/${cluster_id}_setup_cluster.sh`, remote: '/root/setup_cluster.sh' }, { local: `./public/templates/${cluster_id}_haproxy.cfg`, remote: '/root/haproxy.cfg' }, { local: `./public/templates/${cluster_id}_haproxy-ssl.cfg`, remote: '/root/haproxy-ssl.cfg' }]).then(function () {
            console.log("Config file and provision script are uploaded to a new cluster");
            exec(`rm ./public/provision/${cluster_id}_cluster_config.json && rm ./public/provision/${cluster_id}_setup_cluster.sh && rm ./public/templates/${cluster_id}_haproxy-ssl.cfg && rm ./public/templates/${cluster_id}_haproxy.cfg`, function (err, stdout, stderr) {
            });

            ssh.exec('chmod +x setup_cluster.sh', [], {
                cwd: '/root',
                onStdout(chunk) {
                    console.log('stdoutChunk', chunk.toString('utf8'))

                },
                onStderr(chunk) {
                    console.log('stderrChunk', chunk.toString('utf8'))
                },
            }).then(function () {
                clusters_to_install.splice(0, 1);
                is_cluster_installing = false;
                var log_msg = '';
                ssh.execCommand('sleep 15 && while sudo fuser /var/{lib/{dpkg,apt/lists},cache/apt/archives}/lock >/dev/null 2>&1; do sleep 1; done && ./setup_cluster.sh', {
                    cwd: '/root',
                    onStdout(chunk) {
                        log_msg = printLogMsgIfNeeded(chunk,log_msg, cluster_parse_obj.get("name"));
                    },
                    onStderr(chunk) {
                        log_msg = printLogMsgIfNeeded(chunk,log_msg, cluster_parse_obj.get("name"));
                    }
                }).then(function () {
                    console.log("result========");
                    ssh.dispose();

                }, function (error) {

                    console.log("error========");
                    ssh.dispose();

                    console.log(error)
                })
            }, function (error) {
                console.log(error)
            })

        }, function (error) {
            console.log("Cannot upload files to a new cluster");
            console.log(error);
        })
    }, function (error) {
        console.log("Cannot SSH to a new cluster");
        console.log(error);
        console.log("Will try again within a few seconds...")
        setTimeout(clusterProvision, 3000, clusters_to_install[0]);
    });
}

function printLogMsgIfNeeded(chunk, log_msg, cluster_name){
    log_msg += chunk.toString('utf8');
                        var newline_index = log_msg.indexOf('\n');
                        if (newline_index != -1){
                            log_msg = log_msg.replace(/\n/g, '');
                            var msg_to_show = log_msg.substring(0,newline_index);
                            console.log(`${cluster_name}: ` + msg_to_show);
                            if (log_msg.length > newline_index){
                                log_msg = log_msg.substring(newline_index ,log_msg.length);
                            }else{
                                log_msg = '';
                            }
                        }
                        return log_msg;
}

function addClusterToQueue(new_cluster){
    clusters_to_install.push(new_cluster);
}

module.exports = { provisionNextClient, addClusterToQueue };
