/*
    client_provision_job_handler.js
    Methods for client provision (connecting new cloud or dedicated servers)
*/

/*
    condition_to_start example:
    {
        "domain":"server_id.deployed.cc",
        "target":"1.1.1.1.1"
    }

    task dictionary example:
    {
        "ip":"1.1.1.1.1"
    }
*/

const dotenv = require('dotenv');
dotenv.config();

const dns = require('dns');

async function run(job, logger, finish_handler) {
    logger.info(`Run the DNS job with id: ${job.objectId}`);

    const task = job.task;
    if (task == undefined || task.record_type == ip){
        finish_handler(job, "The task dictionary hasn't all required values");
        return;
    }

    //Check if the job has condition_to_start and this condition is fulfilled 
    const condition_to_start = job.condition_to_start;
    if (condition_to_start != undefined && condition_to_start.domain != undefined && condition_to_start.target != undefined){
        logger.info(`Checking A record for ${condition_to_start.domain}. IP for this domain should be ${condition_to_start.target}`);
        dns.lookup(condition_to_start.domain, (err, address, family) => {
            if (err){
                finish_handler(job, err);
                return;
            }

            logger.info(`Found A record: Domain ${condition_to_start.domain}, IP:${address}`);
            //Check the A record for condition_to_start.domain
            if (address == condition_to_start.target){
                //A record specified in condition_to_start is found, a job can be started
                //ToDo: Run the provision script over SSH

                finish_handler(job, null);
                return;
            }else{
                //DNS has A records with these parameters, schedule this job on later time
                finish_handler(job, `No required A record is found. Domain ${condition_to_start.domain} should be resolved to ${condition_to_start.target}`);
                return;
            }
        });
    }

}

module.exports = { run };
