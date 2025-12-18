# Debugging Guide - Why Files Aren't Loading

## Step 1: Check if HTML was actually updated in Odoo

**Question:** Did you actually paste the new HTML into Odoo and save it?

If NO → That's the issue! You need to:
1. Open `LOADER-GITHUB-RAW.html` in this repository
2. Copy **ALL** the contents (485 lines)
3. Go to Odoo → Edit the page → Find your HTML field
4. **DELETE** all existing HTML
5. **PASTE** the new HTML from LOADER-GITHUB-RAW.html
6. **SAVE** the page in Odoo
7. Refresh your browser

---

## Step 2: Check Network Tab for Blocked Requests

Open your browser console:
1. Press **F12** (or right-click → Inspect)
2. Go to **Network** tab
3. Refresh the page (F5)
4. Look for requests to `raw.githubusercontent.com`

### What do you see?

**Option A: No requests to raw.githubusercontent.com**
→ The HTML wasn't updated in Odoo. Go back to Step 1.

**Option B: Requests are there but showing red (failed)**
→ Check the status code:
- **CORS error** → Need to use a different method
- **404** → Branch or files not found
- **403** → Same issue as jsDelivr

**Option C: Requests are green (200 OK)**
→ Files loaded successfully, but JavaScript might have errors. Check Console tab for actual errors.

---

## Step 3: Test if GitHub Raw URLs work in your browser

Open these URLs directly in your browser:

1. CSS file:
```
https://raw.githubusercontent.com/pedrokrug/micro_crm_tunergia/claude/refactor-crm-code-blocks-K3Cix/src/styles.css
```

2. Main.js file:
```
https://raw.githubusercontent.com/pedrokrug/micro_crm_tunergia/claude/refactor-crm-code-blocks-K3Cix/src/main.js
```

**Do these URLs work?**
- If YES → Files are accessible, problem is with Odoo or HTML
- If NO → GitHub might be blocking your IP or repository has issues

---

## Step 4: Check Odoo's Content Security Policy

Some Odoo instances block external scripts for security.

**Check console for CSP errors:**
```
Refused to load the script 'https://raw.githubusercontent.com/...'
because it violates the following Content Security Policy directive
```

If you see this → Odoo is blocking external scripts. You'll need to:
- Add GitHub to Odoo's CSP whitelist, OR
- Host files on your own server, OR
- Embed all code inline in the HTML

---

## Step 5: Quick Test - Inline Version

If external scripts are blocked, use this test HTML with everything inline:

I'll create a test file that has all JavaScript embedded inline...

---

## Common Issues Checklist:

- [ ] I updated the HTML in Odoo (not just in the repo)
- [ ] I can access raw GitHub URLs in my browser
- [ ] Network tab shows the script requests
- [ ] Scripts are loading (status 200)
- [ ] No CORS errors in console
- [ ] No CSP errors in console
- [ ] I hard refreshed (Ctrl+F5)
- [ ] I cleared browser cache

---

## Quick Win: Check Current HTML in Odoo

Look at the current HTML in your Odoo page:
1. Right-click on the page → "View Page Source"
2. Search for "tunergiaApp" or "contractDetailModal"
3. What do you find?

**If you find `<div id="tunergiaApp"></div>`**
→ You're still using the OLD HTML! Go to Step 1.

**If you find `<div class="tunergia-dashboard">`**
→ You have the new HTML! Continue debugging...

---

## Need More Help?

Take a screenshot of:
1. Browser Network tab (showing the requests)
2. Browser Console tab (showing all errors)
3. The HTML source in Odoo (first 50 lines)

This will help identify the exact issue.
