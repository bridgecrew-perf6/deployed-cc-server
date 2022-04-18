/*
    certificate_manager.js
    Methods for managing SSL certificates
*/

const { ZeroSSL } = require('zerossl');
const accessKey = process.env.ZEROSSL_ACCESS_KEY || ''
const zerossl = new ZeroSSL({ accessKey });

async function createCertificate(domain, email) {

    // Generate a keypair
    const keyPair = zerossl.generateKeyPair()

    // Generate a CSR
    const csrOptions = {
        country: 'PL',
        state: 'Krakow',
        locality: 'Krakow',
        organization: '',
        organizationUnit: '',
        email: email,
        commonName: domain
    }

    try {
        const csr = zerossl.generateCSR(keyPair, csrOptions)

        const csr_validate = await zerossl.validateCSR(csr)
        console.log(csr_validate)

        // Create a certificate
        const certificate = await zerossl.createCertificate({
            csr: csr,
            domains: [domain],
            validityDays: 90,
            strictDomains: true
        })
        console.log(certificate)

        // Check it has been created
        const checkResult = await zerossl.getCertificate(certificate.id)
        console.log(checkResult)

        // At this point, you should verify the domain
        const verifyResult = await zerossl.verifyDomains(certificate.id, { validation_method: 'HTTP_CSR_HASH' })
        console.log(verifyResult)
        
    } catch (error) {
        console.log(error)
    }


}

module.exports = { createCertificate };