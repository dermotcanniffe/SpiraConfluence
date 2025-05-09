// --- confluence.js (Fixing Scope, Focusing on Spira PUT) ---
"use strict";

// Register the main handler function
try {
    spiraAppManager.registerEvent_menuEntryClick(APP_GUID, "openConfluenceLink", handleConfluenceLink);
} catch (err) {
    console.error("Error registering Confluence menu click handler:", err);
}

// Main handler (mostly unchanged)
function handleConfluenceLink() {
    console.log("Confluence > Handle Link button clicked.");
    let linkFieldName = SpiraAppSettings[APP_GUID]?.confluenceLinkFieldName;

    if (!linkFieldName || !linkFieldName.startsWith("Custom_")) {
        spiraAppManager.displayErrorMessage("Confluence Link Custom Field Name setting missing/invalid.");
        return;
    }
    console.log(`Checking custom field: ${linkFieldName}`);
    let existingUrl = "";
    try {
        existingUrl = spiraAppManager.getDataItemField(linkFieldName, "textValue");
    } catch (err) { /* ignore */ }

    if (existingUrl && existingUrl.trim() !== "" && existingUrl.toLowerCase().startsWith('http')) {
        console.log(`Found existing URL: ${existingUrl}. Opening in new tab...`);
        window.open(existingUrl, '_blank');
    } else {
        if (existingUrl && existingUrl.trim() !== "") { console.warn(`Value in ${linkFieldName} invalid. Creating page.`); }
        console.log(`Custom field ${linkFieldName} empty/invalid. Creating page via API...`);
        createConfluencePageViaApiAndUpdateSpira(linkFieldName);
    }
}

// Function to create Confluence Page and Update Spira
function createConfluencePageViaApiAndUpdateSpira(spiraLinkFieldName) {
    console.log("Attempting to create Confluence page via API...");

    // --- Declare newPageUrl here to make it available to callbacks ---
    let newPageUrl = "";

    // --- Get Spira Data & Settings ---
    let requirementId = spiraAppManager.artifactId;
    let requirementName = spiraAppManager.getDataItemField("Name", "textValue");
    let projectId = spiraAppManager.projectId;
    let spaceKey = SpiraAppSettings[APP_GUID]?.confluenceSpaceKey;
    let parentPageId = SpiraAppSettings[APP_GUID]?.confluenceParentPageId;
    let confluenceBaseUrlFromSettings = SpiraAppSettings[APP_GUID]?.confluenceBaseUrl;
    const spiraPublicBaseUrl = window.location.origin;
    console.log("Using Spira Base for link-back:", spiraPublicBaseUrl);

    // Basic validation
    if (!requirementName || !confluenceBaseUrlFromSettings || !spiraPublicBaseUrl || !spaceKey) {
        spiraAppManager.displayErrorMessage("Required settings or data missing."); return;
    }
    confluenceBaseUrlFromSettings = confluenceBaseUrlFromSettings.replace(/\/$/, '');

    // --- Construct Confluence API Request ---
    const fullyConstructedEndpoint = `${confluenceBaseUrlFromSettings}/wiki/rest/api/content`;
    // Construct Spira link for Confluence body
    const spiraLinkHtml = `<p>This page is linked to Spira Requirement <a href="${spiraPublicBaseUrl}/#/project/${projectId}/requirement/${requirementId}">${requirementName} (REQ:${requirementId})</a>.</p><p>Further details about the requirement can be found in Spira.</p>`;
    console.log("DEBUG: Link-back HTML:", spiraLinkHtml); // Log the link specifically

    let requestBody = { type: "page", title: `[REQ:${requirementId}] ${requirementName}`, space: { key: spaceKey }, body: { storage: { value: spiraLinkHtml, representation: "storage" }}};
    if (parentPageId && parentPageId > 0) { requestBody.ancestors = [{ id: parseInt(parentPageId, 10) }]; }

    const credentialsForConfluence = { userName: "{confluenceApiEmail}", password: "{confluenceApiToken}" };
    const headers = { "Content-Type": "application/json", "Accept": "application/json" };

    console.log("DEBUG: Endpoint:", fullyConstructedEndpoint);
    console.log("DEBUG: Credentials:", JSON.stringify(credentialsForConfluence));
    console.log("DEBUG: Headers:", JSON.stringify(headers));
    console.log("DEBUG: Request Body:", JSON.stringify(requestBody));

    spiraAppManager.displaySuccessMessage("Creating page in Confluence...");

    // --- Call Confluence API ---
    spiraAppManager.executeRest(
        APP_GUID, "Confluence SpiraApp", "POST", fullyConstructedEndpoint,
        JSON.stringify(requestBody), credentialsForConfluence, headers,
        function(confluenceResponse) { // SUCCESS CALLBACK (Confluence)
            console.log("Confluence page created successfully (RAW Response Wrapper):", confluenceResponse);
            // Reset URL in case of multiple runs / errors
            newPageUrl = "";
            let parsedContent = null;
            try {
                if (confluenceResponse && typeof confluenceResponse.content === 'string') {
                    parsedContent = JSON.parse(confluenceResponse.content);
                    console.log("Parsed Confluence Response Content:", parsedContent);
                } else { throw new Error("Response content missing/invalid."); }

                // Extract URL
                if (parsedContent._links?.base && parsedContent._links?.webui) { newPageUrl = parsedContent._links.base + parsedContent._links.webui; }
                else if (parsedContent._links?.base && parsedContent._links?.tinyui) { newPageUrl = parsedContent._links.base + parsedContent._links.tinyui; }
                else if (parsedContent.id) { newPageUrl = `${confluenceBaseUrlFromSettings}/wiki/spaces/${spaceKey}/pages/${parsedContent.id}`; }
                else { throw new Error("Parsed response missing links or id."); }

                console.log("Determined new page URL:", newPageUrl);
                updateSpiraRequirementLink(projectId, requirementId, spiraLinkFieldName, newPageUrl); // Update Spira

            } catch (parseError) {
                spiraAppManager.displayErrorMessage("Confluence page created, but failed to process response or find URL.");
                console.error("Error processing Confluence response:", parseError, confluenceResponse.content);
                // Try to open generic Confluence home page in new tab on failure?
                window.open(confluenceBaseUrlFromSettings + '/wiki', '_blank');
            }
        },
        function(errorStatus, errorThrown) { // ERROR CALLBACK (Confluence)
             // ... (Keep existing error handling logic here) ...
             console.error("Error creating Confluence page:", errorStatus, errorThrown);
             let errorDetail = "..."; // Extract error detail as before
             spiraAppManager.displayErrorMessage(`Failed to create Confluence page. ...`);
        }
    );
}


// Function to Update Spira Requirement via API
function updateSpiraRequirementLink(projectId, requirementId, fieldName, newUrl) {
    console.log(`Attempting to update Spira Req ${requirementId} via API, field ${fieldName} with URL: ${newUrl}`);
    const getUrl = `projects/${projectId}/requirements/${requirementId}`;

    spiraAppManager.executeApi("Confluence SpiraApp", "7.0", "GET", getUrl, null,
        function(requirementData) { // Success GET
            console.log("Got Spira Req data for update:", requirementData);

            // --- !!! CRITICAL STEP !!! ---
            // --- Construct the 'updatePayload' EXACTLY as required by Spira's PUT /requirements endpoint ---
            // --- You MUST consult the Spira API documentation for this ---
            let updatePayload = {
                RequirementId: requirementData.RequirementId,
                ConcurrencyDate: requirementData.ConcurrencyDate, // Usually required
                // Other required fields ??? (e.g., StatusId, TypeId might be needed even if not changing)
                CustomProperties: requirementData.CustomProperties || []
            };

            let customPropFound = false;
            updatePayload.CustomProperties.forEach(prop => {
                // Check Name/PropertyName based on Spira GET response structure
                if (prop.PropertyName === fieldName || prop.Name === fieldName) {
                    prop.StringValue = newUrl; // Update existing
                    customPropFound = true;
                    // Ensure DefinitionId (if present/required) is correct
                }
            });

            if (!customPropFound) {
                // Add new - CHECK API DOCS for required fields in this object!
                updatePayload.CustomProperties.push({
                    PropertyName: fieldName, // Or Name?
                    // DefinitionId: ???, // Likely needed! Find the ID for Custom_10
                    StringValue: newUrl
                    // FieldType: ??? // Usually not needed if DefinitionId is provided
                });
            }
            // --- End Critical Step ---

            console.log("Prepared Spira Update Payload:", JSON.stringify(updatePayload, null, 2)); // Log formatted payload

            const updateUrl = `projects/${projectId}/requirements`;

            spiraAppManager.executeApi("Confluence SpiraApp", "7.0", "PUT", updateUrl, JSON.stringify(updatePayload),
                function(updateResponse) { // Success PUT
                    console.log("Spira Req updated successfully via API:", updateResponse);
                    spiraAppManager.displaySuccessMessage("Confluence page created and Spira link updated!");
                    console.log("Attempting to open NEW URL in new tab:", newUrl);
                    window.open(newUrl, '_blank'); // Open new tab on SUCCESS
                    setTimeout(() => spiraAppManager.reloadForm(), 500);
                },
                function(spiraUpdateErrorStatus, spiraUpdateErrorThrown) { // Error PUT
                    console.error("Error updating Spira Req via API:", spiraUpdateErrorStatus, spiraUpdateErrorThrown);
                    // Try to get error details from Spira response
                     let errorDetail = (typeof spiraUpdateErrorThrown === 'object' && spiraUpdateErrorThrown !== null) ? JSON.stringify(spiraUpdateErrorThrown) : spiraUpdateErrorThrown;
                     if (typeof spiraUpdateErrorStatus === 'object' && spiraUpdateErrorStatus !== null && spiraUpdateErrorStatus.ExceptionMessage) {
                         errorDetail = spiraUpdateErrorStatus.ExceptionMessage; // Spira often puts errors here
                     } else if (typeof spiraUpdateErrorStatus === 'object' && spiraUpdateErrorStatus !== null && spiraUpdateErrorStatus.statusText) {
                         errorDetail = spiraUpdateErrorStatus.statusText;
                     }
                    spiraAppManager.displayWarningMessage(`Confluence page created (${newPageUrl}), but failed to update Spira link via API. Error: ${errorDetail}. Please update manually.`);
                    console.log("Attempting to open NEW URL in new tab (after Spira update failure):", newPageUrl);
                    window.open(newPageUrl, '_blank'); // Still open Confluence page
                }
            );
        },
        function(getReqErrorStatus, getReqErrorThrown) { // Error GET
            console.error("Error GETting Spira Req before update:", getReqErrorStatus, getReqErrorThrown);
            let errorDetail = "..."; // Extract error detail as above
            spiraAppManager.displayWarningMessage(`Confluence page created, but couldn't get Spira data to update link. Error: ${errorDetail}. Please link manually.`);
            // newPageUrl declared in outer scope should be available if Confluence call succeeded
            if (newPageUrl) {
                console.log("Attempting to open NEW URL in new tab (after Spira GET failure):", newPageUrl);
                window.open(newPageUrl, '_blank');
            }
        }
    );
}