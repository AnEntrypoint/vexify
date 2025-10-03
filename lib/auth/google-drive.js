'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class GoogleDriveAuth {
  constructor(options = {}) {
    this.serviceAccountPath = options.serviceAccountPath;
    this.clientSecretPath = options.clientSecretPath;
    this.tokenPath = options.tokenPath || path.join(process.cwd(), '.gdrive-token.json');
    this.impersonateEmail = options.impersonateEmail;
    this.scopes = options.scopes || ['https://www.googleapis.com/auth/drive.readonly'];
  }

  async authenticate() {
    if (this.serviceAccountPath) {
      return this.authenticateServiceAccount();
    } else if (this.clientSecretPath) {
      return this.authenticateOAuth();
    } else {
      throw new Error('Either serviceAccountPath or clientSecretPath must be provided');
    }
  }

  async authenticateServiceAccount() {
    if (!fs.existsSync(this.serviceAccountPath)) {
      throw new Error(`Service account file not found: ${this.serviceAccountPath}`);
    }

    const keyFile = JSON.parse(fs.readFileSync(this.serviceAccountPath, 'utf8'));

    const auth = new google.auth.JWT({
      email: keyFile.client_email,
      key: keyFile.private_key,
      scopes: this.scopes,
      subject: this.impersonateEmail
    });

    await auth.authorize();
    return auth;
  }

  async authenticateOAuth() {
    if (!fs.existsSync(this.clientSecretPath)) {
      throw new Error(`Client secret file not found: ${this.clientSecretPath}`);
    }

    const credentials = JSON.parse(fs.readFileSync(this.clientSecretPath, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (fs.existsSync(this.tokenPath)) {
      const token = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
      oAuth2Client.setCredentials(token);
      return oAuth2Client;
    }

    return this.getNewToken(oAuth2Client);
  }

  async getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
    });

    console.log('\n📋 Authorize this app by visiting this URL:\n');
    console.log(authUrl);
    console.log('\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve, reject) => {
      rl.question('Enter the authorization code: ', (code) => {
        rl.close();

        oAuth2Client.getToken(code, (err, token) => {
          if (err) {
            reject(new Error(`Error retrieving access token: ${err.message}`));
            return;
          }

          oAuth2Client.setCredentials(token);
          fs.writeFileSync(this.tokenPath, JSON.stringify(token));
          console.log('✓ Token stored to', this.tokenPath);
          resolve(oAuth2Client);
        });
      });
    });
  }
}

module.exports = { GoogleDriveAuth };
