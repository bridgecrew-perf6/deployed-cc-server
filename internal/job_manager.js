/*
    job_manager.js
    Methods for managing jobs
*/
const superagent = require('superagent');

var is_job_running = false;

//Import Job Handlers
const dns_job_handler = require("./jobs/dns_job_handler");
const client_provision = require("./jobs/client_provision_job_handler");

module.exports = function (logger, parse) {

    setInterval( function() {startNextJob(); }, process.env.RUN_NEXT_JOB_INTERVAL);

    //Check if we have a new job to run
    async function startNextJob() {
        if (is_job_running == false) {

            logger.info('Checking new jobs for deployed-server...');
            is_job_running = true;

            //Get all jobs with status "new" and find the next job to start
            try {
                const job_res = await superagent.get(parse.serverURL + '/classes/Job/').query({ where: { status: "new", scope:"server" }, order: "-createdAt" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-MASTER-Key': parse.PARSE_MASTER_KEY }).set('accept', 'json');
                const new_jobs = job_res.body;

                if (new_jobs.results.length > 0) {
                    logger.info(`Found ${new_jobs.results.length} new jobs. Checking if we already can run a job from this list...`);

                    //Find the next job to run
                    var job_to_run = null;
                    for (job in new_jobs.results) {
                        const currentDate = new Date();
                        if (job_to_run.start_after != undefined && job_to_run.start_after > currentDate.getTime()){
                            //Skip this job
                            continue;
                        }
                        job_to_run = job;
                    }

                    if (job_to_run == null){
                        logger.info(`No jobs found. All jobs scheduled on later time`);
                        return;
                    }

                    //Start the found job
                    logger.info(`The job with id: ${job_to_run.objectId} is scheduled`);

                    //ToDo: Add checking that there is no dependency for this task
                    //If there is a dependency - check that the job on which this job depends on has the status ready
                    //If not - check the next job with status "new"

                    //ToDo: Check if we have a job with status "in_progress", for example if the service is stopped

                    //ToDo: Add handling multiple tasks simultaneously

                    if (job_to_run.type == "dns") {
                        startDNSJob(job_to_run);
                    } else if (job_to_run.type == "client_provision") {
                        startClientProvisionJob(job_to_run);
                    } else {
                        logger.info(`There is no handler for the job with id: ${job_to_run.objectId}. Mark this job as 'cancelled' with a note 'No handler for this type of a job'`);
                        //If we cannot handle a job with this type - just skip this for now
                        await updateJobStatus(job_to_run, "cancelled", "No job handler for this type of a job");
                        is_job_running = false;
                    }
                } else {
                    //There is no a job with
                    logger.info('No new jobs are found');
                    is_job_running = false;
                }
            } catch (err) {
                logger.error('Cannot get jobs, err: ' + err);
                is_job_running = false;
            }
        }
    }

    //Handle DNS jobs
    async function startDNSJob(job) {
        try{
            await updateJobStatus(job, "in_progress");
            await dns_job_handler.run(job, logger, jobFinished);
        }catch (err){
            logger.info(`Cannot finish the job with id: ${job.objectId}, err: ${err}`);
        }
    }

    //Handle Client Provision jobs
    async function startClientProvisionJob(job) {
        try{
            await updateJobStatus(job, "in_progress");
            await client_provision.run(job, logger, jobFinished);
        }catch (err){
            logger.info(`Cannot finish the job with id: ${job.objectId}, err: ${err}`);
        }
    }

    //Callback which should be called from the "run" function of a job handler
    async function jobFinished(job, error) {
        if (error != null){
            const currentDate = new Date();
            const next_run_time = currentDate.getTime() + 10*1000;
            logger.error(`Cannot finish the job with id: ${job.objectId}, err: ${error}. Schedule next run on ${next_run_time}`);
            await updateJobStatus(job, "failed", error, next_run_time);
        }else{
            await updateJobStatus(job, "done");
        }
        is_job_running = false;
    }

    //Update a job status in DB
    async function updateJobStatus(job, status, notes, next_run_time) {
        var job_update = {};
        if (status) {
            job_update["status"] = status;
            if (notes != undefined){
                job_update["notes"] = notes;
                job_update["start_after"] = next_run_time;
            }
        }
        try {
            await superagent.put(parse.serverURL + '/classes/Job/' + job.objectId).send(job_update).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-MASTER-Key': parse.PARSE_MASTER_KEY }).set('accept', 'json');
            logger.info(`Status for the job with id: ${job.objectId} is updated from ${job.status} to ${status}`);
        } catch (err) {
            logger.error(`Cannot update the job with id ${job.objectId}, err: ${err}`);
            //ToDo: Retry to update job otherwise we'll think that job is in progress feorever
        }
    }

}
