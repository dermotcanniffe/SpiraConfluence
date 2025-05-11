# SpiraConfluence
A SpiraApp for connecting Spira Requirements to Confluence documents

**Version:** 0.2
**Author:** [Dermot Canniffe/Inflectra Corporation]
**Date:** May 11, 2025

## Overview

This SpiraApp enhances Spira Requirements by adding a dedicated "Confluence" button to the Requirement details page toolbar. This button provides a streamlined workflow for linking Spira Requirements to Confluence pages:

1.  **Open Existing Link:** If a Confluence page URL is already present in a pre-configured custom field on the Requirement, clicking the button will open this URL directly in a new browser tab.
2.  **Create New Page & Link:** If the configured custom field is empty or does not contain a valid URL:
    * A new page will be created in a designated Confluence space via the Confluence API.
    * This new Confluence page will automatically include a link back to the originating Spira Requirement (showing its name and ID).
    * The URL of this newly created Confluence page will be populated into the configured custom field on the Spira Requirement form.
    * The newly created Confluence page will then open in a new browser tab for immediate viewing or editing.
    * **Crucial User Action:** After the link is populated into the Spira form, the user **must manually click Spira's main "Save" button** on the Requirement details page to persist this new Confluence link.

## Setup Instructions

Proper setup requires configuration at both the Spira System Administration level and the Product Administration level for each product intending to use this SpiraApp.

### A. Spira System Administrator Steps:

1.  **Install the SpiraApp:**
    * Ensure "Developer Mode" is enabled in your Spira instance (System Admin > General Settings).
    * Navigate to System Admin > Spira Apps.
    * Upload the `.spiraapp` package file for this "Confluence Integration" SpiraApp.
    * Once uploaded, enable the SpiraApp system-wide using the power toggle button in its row.
2.  **Configure System-Wide Settings for the SpiraApp:**
    * In the System Admin > Spira Apps list, click on the "Confluence Integration" SpiraApp name to access its settings.
    * Configure the following system settings:
        * **`confluenceBaseUrl` (Confluence Base URL):**
            * **Description:** The root URL for your Confluence instance. This is used for API calls and constructing page links.
            * **Example:** `https://your-company.atlassian.net`
            * **Required:** Yes
        * **`confluenceApiEmail` (Confluence API Email for Basic Auth):**
            * **Description:** The email address associated with the Confluence API Token that will be used for authentication.
            * **Example:** `your.email@example.com`
            * **Required:** Yes (for Confluence API Basic Authentication)
        * **`confluenceApiToken` (Confluence API Token / Password):**
            * **Description:** The API token generated from Confluence. This is used as the password component for Basic Authentication with the Confluence API. This setting is stored securely by Spira.
            * **Example:** (Enter your generated API token)
            * **Required:** Yes

### B. Spira Product Administrator Steps (Repeat for each Product):

1.  **Enable the SpiraApp for the Product:**
    * Navigate to the desired Spira Product.
    * Go to Product Admin > General Settings > SpiraApps.
    * Find the "Confluence Integration" SpiraApp in the list and enable it for the current product using its toggle switch.
2.  * Create a Custom Field on Requirements Artifacts to contain the Confluence Page Link
        * Make a note of the field identifier for this custom field (e.g. "Custom_10")    
3.  **Configure Product-Specific Settings for the SpiraApp:**
    * In Product Admin > General Settings > SpiraApps, click on the "Confluence Integration" SpiraApp name or its settings icon.
    * Configure the following product settings:
        * **`confluenceLinkFieldName` (Link Custom Field Name):**
            * **Description:** The exact system name (e.g., `Custom_01`, `Custom_10`) of the Requirement custom property that will store and display the URL to the Confluence page. This custom property **must be of type "Text"**.
            * **Example:** `Custom_10`
            * **Required:** Yes
        * **`confluenceSpaceKey` (Target Confluence Space Key):**
            * **Description:** The unique key of the Confluence Space where new pages should be created if no existing link is found.
            * **Example:** `MYPROJKEY`
            * **Required:** Yes (for creating new pages)
        * **`confluenceParentPageId` (Target Parent Page ID - Optional):**
            * **Description:** If you want new Confluence pages to be created as children of a specific existing page in Confluence, enter that parent page's numerical ID here. If left blank, pages will be created at the root of the specified space.
            * **Example:** `12345678` (or leave blank)
            * **Required:** No

## How to Use (End User Guide)

Once configured by administrators:

1.  Navigate to a Requirement details page within a Spira product where the "Confluence Integration" SpiraApp has been enabled and configured.
2.  Locate and click the **"Confluence"** button in the toolbar (it typically displays with a Confluence logo icon).
3.  The SpiraApp will then perform one of two actions:
    * **If a valid Confluence URL already exists** in the custom field specified in the product settings (e.g., `Custom_10`): The existing Confluence page will immediately open in a new browser tab.
    * **If the custom field is empty or does not contain a valid URL:**
        1.  A message "Attempting to create page in Confluence..." may briefly appear.
        2.  A new page will be created in the configured Confluence space.
        3.  The URL of this new Confluence page will be automatically populated into the designated custom field on the current Spira Requirement form.
        4.  A success message will appear: *"Confluence page created. Link has been populated into the '[YourCustomFieldName]' field on this form. Please click Spira's 'Save' button to persist this change."*
        5.  The newly created Confluence page will open in a new browser tab.
4.  **IMPORTANT (If a new page was created):** After the link is populated into the Spira Requirement form, you **MUST click Spira's main "Save" button** for that Requirement.
    * *Usability Note:* You might need to first click into the custom field where the link was populated to ensure Spira's "Save" button becomes active. Then, click "Save".

## Technical Notes & Development Journey (For Developers / Review)

This version of the SpiraApp utilizes `spiraAppManager.updateFormField()` to populate the Confluence link into the Spira Requirement form. This requires the user to perform a manual save action via Spira's standard "Save" button to persist the change. This approach was adopted for its simplicity and alignment with typical SpiraApp UI interaction patterns.

An earlier development iteration attempted to save the Confluence link back to the Spira Requirement automatically and silently using a direct Spira REST API `PUT` request to the `/projects/{projectId}/requirements` endpoint. This involved more complex client-side logic:
* Fetching the `PropertyDefinitionId` for the target custom field (from the product template API).
* Attempting to cache this `PropertyDefinitionId` in SpiraApp Product Level Storage (`spiraAppManager.storageGetProduct` and `storageInsertProduct`).
* GETting the full Requirement data to obtain the `ConcurrencyDate` and other fields.
* Constructing a complete and valid PUT payload, including the `ConcurrencyDate` and correctly formatted `CustomProperties` array.
* Executing the PUT request using `spiraAppManager.executeApi`.
* Attempting to refresh the form using `spiraAppManager.reloadForm()`.

**Key Challenges Encountered with the Automated API PUT Approach:**
* **Data Persistence Issue:** The Spira API `PUT` request would consistently return a `200 OK` status, but the custom field value containing the Confluence link was often not actually saved/persisted to the Spira database (this was verified by performing a hard browser refresh after the operation). The exact cause for this silent non-persistence despite a successful API response remains undetermined.
* **SpiraApp Storage 500 Error:** Calls to `spiraAppManager.storageGetProduct` (used for attempting to cache the `PropertyDefinitionId`) consistently resulted in a 500 Internal Server Error from the Spira backend service (`PluginService.svc/PluginStorage_Retrieve`). This rendered the caching strategy for `PropertyDefinitionId` ineffective for retrieval, forcing a fallback to fetching the ID from the template on every relevant operation. This 500 error may indicate an underlying issue with the SpiraApp storage service in the target Spira instance.

The JavaScript file (`confluence.js`) contains the currently active `updateFormField` logic, as well as the original API-based update functions commented out for detailed reference and potential future discussion or debugging.

## Known Issues / Minor Usability Notes

* After a new Confluence page link is automatically populated into the custom field on the Spira Requirement form, the user may need to click into that custom field first to make Spira's main "Save" button become active.

---