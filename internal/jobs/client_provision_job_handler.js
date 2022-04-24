/*
    client_provision_job_handler.js
    Methods for client provision (connecting new cloud and dedicated servers)
*/

/*
    condition_to_start example:
    {
        "domain":"server_id.deployed.cc",
        "target":"1.1.1.1.1"
    }

    task dictionary:
    {
        "public_ip":"1.1.1.1.1",
        "server_id":"",
        "priv_key":"",
        "pub_key":"",
        "api_key":""
    }
*/

const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const dns = require('dns');
const { NodeSSH } = require('node-ssh')

const exec = require('child_process').exec;

async function run(job, logger, finish_handler) {
    logger.info(`Run the Client Provision job with id: ${job.objectId}`);

    const task = job.task;
    if (task == undefined || task.public_ip == undefined || task.server_id == undefined || task.priv_key == undefined || task.pub_key == undefined || task.api_key == undefined) {
        finish_handler(job, "The task dictionary hasn't all required values");
        return;
    }

    //Check if the job has condition_to_start and this condition is fulfilled 
    const condition_to_start = job.condition_to_start;
    if (condition_to_start != undefined && condition_to_start.domain != undefined && condition_to_start.target != undefined) {
        logger.info(`Checking A record for ${condition_to_start.domain}. IP for this domain should be ${condition_to_start.target}`);
        dns.resolve4(condition_to_start.domain.toLowerCase(), (err, address, family) => {
            if (err) {
                finish_handler(job, err);
                return;
            }

            logger.info(`Found A record: Domain ${condition_to_start.domain}, IP:${address}`);
            //Check the A record for condition_to_start.domain
            if (address == condition_to_start.target) {
                //A record specified in condition_to_start is found, a job can be started
                //It's time to provision a new server
                clusterProvision(job, finish_handler, logger);
                return;
            } else {
                //DNS has A records with these parameters, schedule this job on later time
                finish_handler(job, `No required A record is found. Domain ${condition_to_start.domain} should be resolved to ${condition_to_start.target}`);
                return;
            }
        });
    }
}

function clusterProvision(job, finish_handler, logger) {

    const task = job.task;
    const ip = task.public_ip;
    const server_id = task.server_id.toLowerCase();

    //Try to ssh to the new cluster
    var ssh = new NodeSSH();
    ssh.connect({
        host: ip,
        username: 'root',
        privateKey: `${require('os').homedir()}/.ssh/id_rsa`
    }).then(function () {

        logger.info(`Connected to a server with id: ${server_id} over SSH`);

        //Create haproxy.cfg from a template
        var haproxy_cfg = '';
        try {
            haproxy_cfg = fs.readFileSync('./public/templates/haproxy.cfg', 'utf8');
        } catch (error) {
            finish_handler(job, JSON.stringify(error));
            return;
        }

        //Create HAProxy configs
        haproxy_cfg = haproxy_cfg.replace(/{{server_id}}/g, server_id);
        haproxy_cfg = haproxy_cfg.replace(/{{domain}}/g, process.env.SERVER_DOMAIN);
        fs.writeFileSync(`./public/templates/${server_id}_haproxy.cfg`, haproxy_cfg);

        //ToDo: Check if we need the second HAProxy config
        haproxy_cfg = haproxy_cfg.replace('#bind *:443 ssl', 'bind *:443 ssl');
        haproxy_cfg = haproxy_cfg.replace('#redirect scheme', 'redirect scheme');
        fs.writeFileSync(`./public/templates/${server_id}_haproxy-ssl.cfg`, haproxy_cfg);

        //Create provision script & haproxy.cfg from a template
        var provision_script = '';
        try {
            provision_script = fs.readFileSync('./public/provision/setup_server.sh', 'utf8');
        } catch (error) {
            finish_handler(job, JSON.stringify(error));
            return;
        }
        provision_script = provision_script.replace(/{{server_id}}/g, server_id);
        provision_script = provision_script.replace(/{{url}}/g, process.env.DEPLOYED_CC_SERVER_API_ENDPOINT);
        provision_script = provision_script.replace(/{{client_URL}}/g, process.env.CLIENT_GIT_REPO);

        //ToDo: save keys from user's object - logged_user
        //if user hasnt keys yet - generate them here and upload
        provision_script = provision_script.replace(/{{priv_key}}/g, task.priv_key);
        provision_script = provision_script.replace(/{{pub_key}}/g, task.pub_key);

        fs.writeFileSync(`./public/provision/${server_id}_setup_server.sh`, provision_script);

        //Create cluster config file
        var cluster_config = {};
        cluster_config.api_key = task.api_key;
        cluster_config.server_id = server_id;

        fs.writeFileSync(`./public/provision/${server_id}_cluster_config.json`, JSON.stringify(cluster_config));

        ssh.putFiles([{ local: `./public/provision/${server_id}_cluster_config.json`, remote: '/root/cluster_config.json' }, { local: `./public/provision/${server_id}_setup_server.sh`, remote: '/root/setup_server.sh' }, { local: `./public/templates/${server_id}_haproxy.cfg`, remote: '/root/haproxy.cfg' }, { local: `./public/templates/${server_id}_haproxy-ssl.cfg`, remote: '/root/haproxy-ssl.cfg' }]).then(function () {

            logger.info(`Put files to server id: ${server_id} over SSH`);

            //Remove temporary files
            exec(`rm ./public/provision/${server_id}_cluster_config.json && rm ./public/provision/${server_id}_setup_server.sh && rm ./public/templates/${server_id}_haproxy-ssl.cfg && rm ./public/templates/${server_id}_haproxy.cfg`, function (err, stdout, stderr) {
            });

            logger.info(`Start provision a server with id: ${server_id}`);

            var log_msg = '';

            ssh.exec('chmod +x setup_server.sh', [], {
                cwd: '/root',
                onStdout(chunk) {
                    log_msg = printLogMsgIfNeeded(chunk, log_msg, server_id, logger);
                },
                onStderr(chunk) {
                    log_msg = printLogMsgIfNeeded(chunk, log_msg, server_id, logger);
                },
            }).then(function () {
                is_cluster_installing = false;
                ssh.execCommand('sleep 15 && while sudo fuser /var/{lib/{dpkg,apt/lists},cache/apt/archives}/lock >/dev/null 2>&1; do sleep 1; done && ./setup_server.sh', {
                    cwd: '/root',
                    onStdout(chunk) {
                        log_msg = printLogMsgIfNeeded(chunk, log_msg, server_id, logger);
                    },
                    onStderr(chunk) {
                        log_msg = printLogMsgIfNeeded(chunk, log_msg, server_id, logger);
                    }
                }).then(function () {
                    ssh.dispose();
                    finish_handler(job, null);
                    return;
                }, function (error) {
                    ssh.dispose();
                    //Something went wrong during provision
                    //We should reschedule server provision
                    finish_handler(job, error);
                    return;
                })
            }, function (error) {
                finish_handler(job, error);
                return;
            })
        }, function (error) {
            finish_handler(job, error);
            return;
        })
    }, function (error) {
        finish_handler(job, `Cannot SSH into a new server: ${error}`);
        return;
    });
}

function printLogMsgIfNeeded(chunk, log_msg, server_id, logger){
    log_msg += chunk.toString('utf8');
                        var newline_index = log_msg.indexOf('\n');
                        if (newline_index != -1){
                            log_msg = log_msg.replace(/\n/g, '');
                            var msg_to_show = log_msg.substring(0,newline_index);
                            logger.info(`${server_id}: ` + msg_to_show);
                            if (log_msg.length > newline_index){
                                log_msg = log_msg.substring(newline_index ,log_msg.length);
                            }else{
                                log_msg = '';
                            }
                        }
                        return log_msg;
}

module.exports = { run };
