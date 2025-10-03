# Google Drive Integration Setup

Vexify supports syncing Google Drive folders using two authentication methods:

1. **Service Account with Domain-Wide Delegation** (recommended for workspace admins)
2. **OAuth 2.0 User Login** (simple personal use)

---

## Method 1: Service Account with Domain-Wide Delegation

**Best for:** Google Workspace admins who need to access users' Drive files

### Step 1: Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Drive API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"
4. Create Service Account:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Fill in service account details
   - Click "Create and Continue"
5. Download JSON key:
   - Click on the created service account
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key" > "JSON"
   - Save as `service-account.json`

### Step 2: Enable Domain-Wide Delegation

1. In the service account details, click "Advanced settings"
2. Note the **Client ID** (numeric string)
3. Check "Enable Google Workspace Domain-wide Delegation"
4. Save changes

### Step 3: Authorize in Google Workspace Admin

1. Go to [Google Admin Console](https://admin.google.com/)
2. Navigate to: Security > Access and data control > API controls
3. Click "Manage Domain Wide Delegation"
4. Click "Add new"
5. Enter the **Client ID** from Step 2
6. Add OAuth scopes:
   ```
   https://www.googleapis.com/auth/drive.readonly
   ```
7. Click "Authorize"

### Step 4: Use with Vexify

```bash
npx vexify gdrive ./mydb.db <folder-id> \
  --service-account ./service-account.json \
  --impersonate user@yourdomain.com
```

**Parameters:**
- `<folder-id>`: Google Drive folder ID (use `root` for My Drive root)
- `--impersonate`: Email of user whose Drive to access

**Finding Folder ID:**
- Open folder in Google Drive
- URL format: `https://drive.google.com/drive/folders/1ABC...XYZ`
- Copy the ID after `/folders/`

---

## Method 2: OAuth 2.0 User Login

**Best for:** Personal use, accessing your own Drive

### Step 1: Create OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Drive API** (same as Method 1, Step 1)
3. Create OAuth credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Desktop app"
   - Name: "Vexify Drive Sync"
   - Click "Create"
4. Download JSON:
   - Click the download icon next to your OAuth client
   - Save as `client-secret.json`

### Step 2: Use with Vexify

```bash
npx vexify gdrive ./mydb.db <folder-id> \
  --client-secret ./client-secret.json
```

**First-time flow:**
1. Vexify will print an authorization URL
2. Open URL in browser
3. Sign in with your Google account
4. Grant permissions
5. Copy the authorization code
6. Paste code into terminal
7. Token saved to `.gdrive-token.json` for future use

**Subsequent runs:**
- Uses saved token automatically
- No browser login required

---

## Examples

### Sync entire My Drive (domain-wide delegation)
```bash
npx vexify gdrive ./workspace.db root \
  --service-account ./sa.json \
  --impersonate john@company.com
```

### Sync specific folder (OAuth)
```bash
npx vexify gdrive ./personal.db 1ABCxyz123_folderID \
  --client-secret ./oauth.json
```

### Limit files and use custom model
```bash
npx vexify gdrive ./mydb.db root \
  --client-secret ./oauth.json \
  --max-files 500 \
  --model embeddinggemma
```

---

## Supported File Types

- **Documents:** PDF, DOCX, DOC, TXT
- **Google Docs:** Auto-exported to PDF
- **Spreadsheets:** XLSX, XLS, CSV, Google Sheets (exported)
- **Web:** HTML
- **Data:** JSON

---

## Security Best Practices

### For Domain-Wide Delegation:
- ⚠️ **High Risk**: Service accounts can impersonate ANY user, including super admins
- Use least-privilege scopes (`.readonly` when possible)
- Rotate service account keys regularly
- Audit service account usage
- Restrict to specific folders when possible

### For OAuth:
- Store `client-secret.json` securely
- Add `.gdrive-token.json` to `.gitignore`
- Revoke access at: https://myaccount.google.com/permissions
- Use read-only scopes

---

## Troubleshooting

### "Access denied" with service account
- Verify domain-wide delegation is enabled
- Check OAuth scopes in Admin Console match exactly
- Ensure impersonated user exists in workspace
- Wait 5-10 minutes after authorization changes

### "Invalid grant" error
- Token may be expired
- Delete `.gdrive-token.json` and re-authenticate
- Check system clock is accurate

### "File not found"
- Verify folder ID is correct
- Check user has access to the folder
- Ensure folder is not in trash

### Rate limits
- Google Drive API: 1000 queries per 100 seconds per user
- Reduce `--max-files` if hitting limits
- Add delays between batches (handled automatically)

---

## Architecture Notes

**DRY Implementation:**
- Reuses existing processor pipeline (`lib/processors/`)
- Same metadata format as folder sync
- Consistent error handling across all sources

**Files:**
- `lib/auth/google-drive.js` - Authentication handler
- `lib/crawlers/gdrive.js` - Drive crawler with smart sync
- CLI integration in `lib/bin/cli.js`
