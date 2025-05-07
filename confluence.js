// --- confluence.js (Conditional Link Version) ---
"use strict";

try {
    // Make sure this registers the 'handleConfluenceLink' function below
    spiraAppManager.registerEvent_menuEntryClick(APP_GUID, "openConfluenceLink", handleConfluenceLink);
} catch (err) {
    console.error("Error registering Confluence menu click handler:", err);
}

/**
 * Checks for an existing link in a custom field. If found, navigates there.
 * Otherwise, constructs the Confluence "Create Page" URL and navigates.
 * THIS IS THE MAIN FUNCTION CALLED BY THE BUTTON CLICK.
 */
function handleConfluenceLink() {
    console.log("Confluence > Handle Link button clicked.");

    // --- 1. Get Settings (including the custom field name) ---
    // Reads the 'confluenceLinkFieldName' setting you configure in Spira Product Admin
    let linkFieldName = SpiraAppSettings[APP_GUID]?.confluenceLinkFieldName;

    if (!linkFieldName || !linkFieldName.startsWith("Custom_")) {
        spiraAppManager.displayErrorMessage("Confluence Link Custom Field Name setting is missing or invalid (must be like 'Custom_XX'). Please configure it in Product Settings.");
        return;
    }
    console.log(`Checking custom field: ${linkFieldName}`);

    // --- 2. Check Existing Link ---
    let existingUrl = "";
    try {
        // Reads the value from the specified custom field on the current Requirement
        existingUrl = spiraAppManager.getDataItemField(linkFieldName, "textValue");
    } catch (err) {
        console.warn(`Could not read custom field ${linkFieldName}: ${err.message}`);
        existingUrl = ""; // Treat as empty if error reading
    }

    // --- 3. Decide Where to Go (The Core Logic)---
    if (existingUrl && existingUrl.trim() !== "") {
        // IF Custom field has a value, navigate there directly
        console.log(`Found existing URL: ${existingUrl}. Navigating...`);
        if (existingUrl.toLowerCase().startsWith('http')) {
             spiraAppManager.setWindowLocation(existingUrl);
        } else {
             console.error(`Value in ${linkFieldName} does not look like a valid URL: ${existingUrl}`);
             spiraAppManager.displayErrorMessage(`The value in the custom field '${linkFieldName}' doesn't look like a valid URL. Cannot navigate.`);
        }
    } else {
        // ELSE Custom field is empty, call the function to build the create page link
        console.log(`Custom field ${linkFieldName} is empty. Constructing 'Create Page' URL...`);
        constructAndNavigateToCreateUrl(); // Go to the 'create' logic
    }
}

/**
 * Constructs the Confluence "Create Page" URL and navigates.
 * (This function is called by handleConfluenceLink if no existing URL is found)
 */
function constructAndNavigateToCreateUrl() {
    console.log("Constructing 'Create Page' URL.");

    // --- Get Spira Requirement Data ---
    let requirementId = null;
    let requirementName = "";
    try {
        requirementId = spiraAppManager.getDataItemField("RequirementId", "intValue");
        requirementName = spiraAppManager.getDataItemField("Name", "textValue");

        if (requirementId === null || requirementId === undefined || !requirementName) {
             spiraAppManager.displayErrorMessage("Could not retrieve Requirement ID and Name for creating link.");
            return;
        }
        console.log(`Req ID: ${requirementId}, Name: ${requirementName}`);
    } catch (err) {
        console.error("Confluence App - Error getting Requirement data for create:", err);
        spiraAppManager.displayErrorMessage("Error retrieving Requirement data for create link: " + err.message);
        return;
    }

    // --- Get Settings for Create URL ---
    let spaceKey = SpiraAppSettings[APP_GUID]?.confluenceSpaceKey;
    let parentPageId = SpiraAppSettings[APP_GUID]?.confluenceParentPageId; // This is an integer
    let createPath = SpiraAppSettings[APP_GUID]?.confluenceCreatePath;   // e.g., /wiki/create-content/page
    let baseUrl = SpiraAppSettings[APP_GUID]?.confluenceBaseUrl || '';     // From system settings

    if (!baseUrl) {
         spiraAppManager.displayErrorMessage("Confluence Base URL is not configured in System Settings.");
         return;
     }
     if (!spaceKey || !createPath) {
        spiraAppManager.displayErrorMessage("Confluence Space Key and Create Path must be configured in Product Settings for creating link.");
        return;
    }

    // Clean up paths
    baseUrl = baseUrl.replace(/\/$/, '');
    if (createPath && !createPath.startsWith('/')) {
        createPath = '/' + createPath;
    }

    // --- Construct the URL ---
    let encodedTitle = encodeURIComponent(`[REQ:${requirementId}] ${requirementName}`);
    
    // Start with the base path from settings
    let constructedUrl = `${baseUrl}${createPath}`;
    
    // Add the dynamic query parameters
    constructedUrl += `?spaceKey=${encodeURIComponent(spaceKey)}`;
    constructedUrl += `&title=${encodedTitle}`; // Confluence should pre-fill this title
    
    if (parentPageId !== null && parentPageId !== undefined && parentPageId > 0) {
        constructedUrl += `&parentPageId=${parentPageId}`;
    }

    // NOW ADD THE STATIC PARAMETERS YOU FOUND
    constructedUrl += `&withFallback=true&source=globalCreateDropdown-page`;

    console.log(`Constructed Create URL: ${constructedUrl}`);

    // --- Navigate ---
    spiraAppManager.setWindowLocation(constructedUrl);
}