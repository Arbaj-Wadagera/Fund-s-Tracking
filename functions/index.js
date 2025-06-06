const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const functions = require("firebase-functions");
const {logger} = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();

// This function triggers when a new document is created in the 'mailQueue' collection
exports.processOverspendEmailQueue = onDocumentCreated("mailQueue/{docId}", async (event) => {
  // --- CORRECTED CODE: Initialize SendGrid inside the function ---
  sgMail.setApiKey(functions.config().sendgrid.key);
  logger.info(`Received new mail queue request with Event ID: ${event.id}`);

  // The document snapshot is now located at event.data
  const snap = event.data;
  if (!snap) {
    logger.error("No data associated with the event, skipping.");
    return;
  }
  const mailData = snap.data();

  // The document ID is in event.params
  const docId = event.params.docId;

  logger.log(`Processing email for Doc ID: ${docId}, To: ${mailData.to}, Subject: ${mailData.subject}`);

  const firestoreDb = admin.firestore();

  // Construct the email message for SendGrid
  const msg = {
    to: mailData.to,
    from: {
      email: mailData.from,
      name: "Fund's Tracker Notifications",
    },
    subject: mailData.subject,
    html: mailData.html,
  };

  try {
    // Send the email using SendGrid
    await sgMail.send(msg);
    logger.log(`Email successfully sent via SendGrid to: ${mailData.to} for Doc ID: ${docId}`);

    // Update the document status in Firestore to 'sent'
    await firestoreDb.collection("mailQueue").doc(docId).update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      deliveryInfo: "Successfully handed to SendGrid.",
    });
    logger.log(`Mail status updated to 'sent' for Doc ID: ${docId}`);
  } catch (error) {
    logger.error(`Error sending email via SendGrid for Doc ID: ${docId}`, error);

    let detailedError = error.toString();
    if (error.response && error.response.body && error.response.body.errors) {
      detailedError = `SendGrid API Error: ${JSON.stringify(error.response.body.errors)}`;
    } else if (error.code) {
      detailedError = `Error Code: ${error.code}, Message: ${error.message}`;
    }

    // Update the document status in Firestore to 'error'
    await firestoreDb.collection("mailQueue").doc(docId).update({
      status: "error",
      errorMessage: detailedError,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.error(`Mail status updated to 'error' for Doc ID: ${docId}. Error details: ${detailedError}`);
  }
});