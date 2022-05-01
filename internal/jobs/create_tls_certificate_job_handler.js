/*
    create_tls_certificate_job_handler.js
    Methods to create TLS certificates
*/

/*
    condition_to_start example:
    {
        "domain":"server_id.deployed.cc",
        "target":"1.1.1.1.1"
    }

    task dictionary:
    {
        "domain":"server_id.deployed.cc"
    }
*/

const dotenv = require('dotenv');
dotenv.config();

const dns = require('dns');

const { ZeroSSL } = require('zerossl');
const accessKey = process.env.ZEROSSL_ACCESS_KEY || ''
const zerossl = new ZeroSSL({ accessKey });

async function run(job, logger, finish_handler) {
    logger.info(`Run Create TLS Sertificate job with id: ${job.objectId}`);

    const task = job.task;
    if (task == undefined || task.domain == undefined) {
        finish_handler(job, "The task dictionary hasn't all required values");
        return;
    }

    //Check if the job has condition_to_start and this condition is fulfilled 
    const condition_to_start = job.condition_to_start;
    if (condition_to_start != undefined && condition_to_start.domain != undefined && condition_to_start.target != undefined) {
        logger.info(`Checking A record for ${condition_to_start.domain}. IP for this domain should be ${condition_to_start.target}`);
        dns.resolve4(condition_to_start.domain.toLowerCase(), async (err, address, family) => {
            if (err) {
                finish_handler(job, err);
                return;
            }

            logger.info(`Found A record: Domain ${condition_to_start.domain}, IP:${address}`);
            //Check the A record for condition_to_start.domain
            if (address == condition_to_start.target) {
                //A record specified in condition_to_start is found, a job can be started
                //It's time to request a new certificate
                const keyPair = zerossl.generateKeyPair()

                // Generate a CSR
                const csrOptions = {
                    country: 'PL',
                    state: 'Krakow',
                    locality: 'Krakow',
                    organization: '',
                    organizationUnit: '',
                    email: "certs@deployed.cc",
                    commonName: task.domain
                }

                try {
                    const csr = zerossl.generateCSR(keyPair, csrOptions)

                    const csr_validate = await zerossl.validateCSR(csr)
                    logger.info(`CSR validation result: ${JSON.stringify(csr_validate)}`);

                    // Create a certificate
                    const certificate = await zerossl.createCertificate({
                        csr: csr,
                        domains: [task.domain],
                        validityDays: 90,
                        strictDomains: true
                    })
                    logger.info(`New certificate requested: ${JSON.stringify(certificate)}`);

                    //Check if a certificate has been created
                    //const checkResult = await zerossl.getCertificate(certificate.id)
                    //console.log(checkResult)

                    // At this point, you should verify the domain
                    //const verifyResult = await zerossl.verifyDomains(certificate.id, { validation_method: 'HTTP_CSR_HASH' })
                    //console.log(verifyResult)

                    finish_handler(job, null);
                } catch (error) {
                    finish_handler(job, `Cannot create a new ceriticate: ${JSON.stringify(error)}`);
                }

            } else {
                //DNS has A records with these parameters, schedule this job on later time
                finish_handler(job, `No required A record is found. Domain ${condition_to_start.domain} should be resolved to ${condition_to_start.target}`);
                return;
            }
        });
    }
}

module.exports = { run };