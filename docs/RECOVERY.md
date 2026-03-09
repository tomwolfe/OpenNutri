# OpenNutri Recovery Guide

## Overview

OpenNutri uses **zero-knowledge encryption**, which means your data is encrypted client-side and the server cannot access it. This provides maximum privacy, but also means **you are responsible for managing your recovery options**.

This guide explains your recovery options and how to use them.

---

## Recovery Options

OpenNutri provides two recovery methods:

### 1. BIP-39 Mnemonic Phrase (Recommended)

A 24-word recovery phrase that can restore your entire vault.

**Pros:**
- ✅ Single phrase to backup
- ✅ Industry standard (BIP-39)
- ✅ Can be written on paper
- ✅ Works across all devices

**Cons:**
- ⚠️ All-or-nothing (whoever has it has everything)

### 2. Shamir's Secret Sharing (Advanced)

Splits your recovery into 3 shards with a 2-of-3 threshold.

**Pros:**
- ✅ More flexible distribution
- ✅ No single point of failure
- ✅ Can revoke individual shards

**Cons:**
- ⚠️ More complex to manage
- ⚠️ Need to track multiple shards

---

## Setting Up Recovery

### Method 1: Mnemonic Phrase

1. **Navigate to Settings**
   - Click your profile icon → Settings
   - Or go to `/settings`

2. **Generate Recovery Kit**
   - Click "Generate Recovery Kit"
   - Enter your password to confirm

3. **Save Your Mnemonic**
   - You'll see 24 words displayed
   - **Write them down on paper** (do not screenshot)
   - Store in a secure location (safe, safety deposit box)
   - Consider multiple copies in different locations

4. **Verify Your Mnemonic**
   - You'll be asked to re-enter some words
   - This ensures you saved them correctly

5. **Store Safely**
   - ✅ Fireproof safe
   - ✅ Safety deposit box
   - ✅ Engraved metal backup
   - ❌ Not in plain text file
   - ❌ Not in email/cloud storage

### Method 2: Shamir's Secret Sharing

1. **Navigate to Settings**
   - Click your profile icon → Settings

2. **Enable Social Recovery**
   - Click "Enable Social Recovery"
   - Choose 2-of-3 shard distribution

3. **Distribute Shards**
   - **Shard 1 (Local):** Automatically stored on this device
   - **Shard 2 (Cloud):** Encrypted and stored on OpenNutri servers
   - **Shard 3 (Manual):** Download and store securely

4. **Download Manual Shard**
   - Click "Download Shard"
   - Save as PDF or text file
   - Store separately from your device

---

## Recovery Process

### When You Forget Your Password

1. **Go to Recovery Page**
   - Navigate to `/recovery`
   - Or click "Forgot Password?" on login

2. **Choose Recovery Method**

   **Option A: Mnemonic Recovery**
   ```
   1. Select "Recover with Mnemonic"
   2. Enter your 24-word phrase
   3. Set a new password
   4. Click "Recover Vault"
   ```

   **Option B: Shard Recovery**
   ```
   1. Select "Recover with Shards"
   2. Enter any 2 of your 3 shards
   3. Set a new password
   4. Click "Recover Vault"
   ```

3. **Wait for Recovery**
   - This may take a few seconds
   - Your data will be decrypted and re-encrypted

4. **Login with New Password**
   - Use your new password to login
   - All your data will be accessible

### When You Lose Your Device

1. **Get a New Device**
   - Install OpenNutri or visit the website
   - Open in a modern browser (Chrome, Firefox, Safari, Edge)

2. **Start Recovery**
   - Click "Recover Account"
   - Choose your recovery method

3. **Enter Recovery Credentials**
   - Mnemonic: Enter all 24 words
   - Shards: Enter any 2 shards

4. **Set New Password**
   - Choose a strong, memorable password
   - Consider using a password manager

5. **Re-setup Recovery**
   - Generate new recovery credentials
   - Update your backup locations

---

## Recovery Best Practices

### Do's ✅

- **Test your recovery** before you need it
  - Practice recovering on a test account
  - Verify your mnemonic/shards work

- **Store multiple copies**
  - At least 2-3 locations
  - Different physical locations

- **Use durable materials**
  - Paper degrades over time
  - Consider metal backups (Cryptosteel, Billfodl)

- **Update after password changes**
  - Recovery is tied to your vault key
  - Password changes don't invalidate recovery

- **Tell a trusted person**
  - Where your recovery is stored
  - How to use it in case of emergency

### Don'ts ❌

- **Don't store digitally** (unless encrypted)
  - No plain text files
  - No screenshots
  - No cloud storage without encryption

- **Don't share publicly**
  - Never post recovery info online
  - Don't share in support tickets

- **Don't modify the phrase**
  - Words must be exact
  - Order matters
  - No extra spaces or punctuation

- **Don't wait**
  - Set up recovery immediately
  - Don't accumulate data without backup

---

## Troubleshooting

### "Invalid Mnemonic" Error

**Possible Causes:**
- Typo in one or more words
- Words in wrong order
- Using wrong wordlist (BIP-39)
- Extra spaces or characters

**Solutions:**
1. Double-check each word against BIP-39 wordlist
2. Verify word order (numbered 1-24)
3. Remove any extra spaces
4. Try lowercase only

### "Insufficient Shards" Error

**Possible Causes:**
- Only provided 1 shard (need 2)
- One shard is corrupted
- Shards from different vaults

**Solutions:**
1. Ensure you have at least 2 valid shards
2. Verify shard format (hex string)
3. Check shards are from same vault

### Recovery Takes Too Long

**Normal:** 5-30 seconds depending on data size

**If > 1 minute:**
- Check internet connection
- Try a different browser
- Clear browser cache
- Contact support if persistent

### "Vault Not Found" After Recovery

**Possible Causes:**
- Recovery completed but sync pending
- Browser cache issue
- Wrong account recovered

**Solutions:**
1. Wait for sync to complete (check sync indicator)
2. Refresh the page
3. Clear cache and reload
4. Verify you recovered the correct account

---

## Emergency Recovery

### If You Lose Both Password AND Recovery

Unfortunately, with zero-knowledge encryption, **there is no way to recover your data** without:
- Your password, OR
- Your recovery mnemonic, OR
- 2-of-3 recovery shards

This is the trade-off for complete privacy. The server cannot access your data even if requested.

### If Someone Else Has Your Recovery

If you suspect your recovery credentials are compromised:

1. **Immediately create a new account**
2. **Manually re-enter critical data**
3. **Set up new recovery credentials**
4. **Delete old account** (Settings → Delete Account)

---

## Recovery Checklist

Use this checklist to ensure you're prepared:

- [ ] I have generated recovery credentials
- [ ] I have written down my 24-word mnemonic (or shards)
- [ ] I have stored recovery in at least 2 locations
- [ ] I have tested recovery with a test account
- [ ] A trusted person knows where to find my recovery
- [ ] My recovery is stored in fireproof/waterproof container
- [ ] I have not stored recovery digitally (or it's encrypted)
- [ ] I know how to access the recovery page (`/recovery`)

---

## Support

If you need help with recovery:

- **Documentation:** This guide + `/docs`
- **Email:** support@opennutri.app
- **Response Time:** Within 48 hours

**Important:** Support cannot recover your data for you. They can only help troubleshoot the recovery process.

---

*Last Updated: March 2026*
