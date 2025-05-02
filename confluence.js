// --- confluence.js (Renamed from confluence_quicklinker.js) ---
"use strict";

// Register the function to call when the menu item is clicked
// Make sure 'openConfluenceLink' matches the 'action' in the manifest entry's name
try {
    spiraAppManager.registerEvent_menuEntryClick(APP_GUID, "openConfluenceLink", openConfluenceLink);
} catch (err) {
    console.error("Error registering Confluence menu click handler:", err);
}

/**
 * Main function triggered by the menu click.
 * Constructs the Confluence URL based on settings and navigates the browser.
 */
function openConfluenceLink() {
    console.log("Confluence > Open Confluence Link button clicked."); // <-- Updated log prefix

    // --- 1. Get Spira Requirement ID ---
    let requirementId = null;
    try {
        requirementId = spiraAppManager.getDataItemField("RequirementId", "intValue");
        console.log(`Confluence App - Got Req ID: ${requirementId}`); // <-- Updated log prefix

        if (requirementId === null || requirementId === undefined) {
             spiraAppManager.displayErrorMessage("Could not retrieve the Requirement ID.");
            return;
        }
    } catch (err) {
        console.error("Confluence App - Error getting Requirement ID:", err); // <-- Updated log prefix
        spiraAppManager.displayErrorMessage("Error retrieving Requirement ID: " + err.message);
        return;
    }

    // --- 2. Get Settings ---
    let urlTemplate = SpiraAppSettings[APP_GUID]?.confluenceUrlTemplate;
    let baseUrl = SpiraAppSettings[APP_GUID]?.confluenceBaseUrl || '';

    if (!urlTemplate) {
        spiraAppManager.displayErrorMessage("Confluence URL Template is not configured in Product Settings for this SpiraApp.");
        return;
    }
    console.log(`Confluence App - Using URL Template: ${urlTemplate}`); // <-- Updated log prefix

    // --- 3. Construct the URL ---
    let constructedUrl = urlTemplate;
    constructedUrl = constructedUrl.replace("{reqId}", requirementId);
     if (baseUrl) {
        constructedUrl = constructedUrl.replace("{baseUrl}", baseUrl.replace(/\/$/, ''));
     } else if (constructedUrl.includes("{baseUrl}")) {
         spiraAppManager.displayWarningMessage("URL template uses {baseUrl}, but Confluence Base URL is not configured in System Settings.");
     }

     if (!constructedUrl || !constructedUrl.toLowerCase().startsWith('http')) {
         spiraAppManager.displayErrorMessage(`Failed to construct a valid URL from template "${urlTemplate}" and Req ID ${requirementId}. Result: ${constructedUrl}`);
         return;
     }

    console.log(`Confluence App - Constructed URL: ${constructedUrl}`); // <-- Updated log prefix

    // --- 4. Navigate ---
    spiraAppManager.setWindowLocation(constructedUrl);
}
