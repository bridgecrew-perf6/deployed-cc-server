/*
    dns_jobs.js
    Methods for managing DNS jobs (manage A, CNAME records etc)
*/

/*
    task dictionary for A records:
    {
        "record_type":"A",
        "sub_domain":"some_subdomain",
        "domain":"domain.com",
        "target":"1.1.1.1.1"
    }

    task dictionary for CNAME records:
    {
        "record_type":"CNAME",
        "sub_domain":"some_subdomain",
        "domain":"domain.com",
        "target":"server_id.domain.com"
    }
*/

const dotenv = require('dotenv');
dotenv.config();

const ovh = require('ovh')({
	endpoint: process.env.OVH_ENDPOINT,
	appKey: process.env.OVH_APP_KEY,
	appSecret: process.env.OVH_APP_SECRET,
	consumerKey: process.env.OVH_CONSUMER_KEY
});

async function run(job, logger, finish_handler) {
    logger.info(`Run the DNS job with id: ${job.objectId}`);

    const task = job.task;
    if (task == undefined || task.record_type == undefined || task.domain == undefined || task.sub_domain == undefined || task.target == undefined){
        finish_handler(job, "The task dictionary hasn't all required values");
        return;
    }

    //Add a DNS record using OVH API
    ovh.request('POST', `/domain/zone/${task.domain}/record`, {
        fieldType: task.record_type,
        subDomain: task.sub_domain,
        target: task.target
    }, function (err, new_record) {
        if (err != null) {
            finish_handler(job, err);
            return;
        }else{
            logger.info(`New DNS record has been added: ${JSON.stringify(new_record)}`);
        }

        //Refresh OVH DNS records
        ovh.request('POST', `/domain/zone/${task.domain}/refresh`, function (err, is_refreshed) {
            if (err == null) {
                logger.info(`DNS records have been refreshed`);
                finish_handler(job, null);
            } else {
                finish_handler(job, err);
            }
        });

    });
}

module.exports = { run };
