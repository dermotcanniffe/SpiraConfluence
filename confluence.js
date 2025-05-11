// --- confluence.js (Revised for updateFormField - FULL FILE) ---
"use strict";

// Register the main handler function for the menu click
try {
    // Ensure APP_GUID is available (it's provided by Spira when the script is loaded)
    if (typeof APP_GUID === 'undefined') {
        console.error("SpiraApp Critical Error: APP_GUID is not defined. Cannot register menu click.");
        // Display error to user only if spiraAppManager is available
        if (typeof spiraAppManager !== 'undefined' && spiraAppManager.displayErrorMessage) {
            spiraAppManager.displayErrorMessage("SpiraApp initialization error. Please contact support (APP_GUID missing).");
        }
    } else {
        spiraAppManager.registerEvent_menuEntryClick(APP_GUID, "openConfluenceLink", handleConfluenceLink);
    }
} catch (err) {
    console.error("SpiraApp Error: Failed to register Confluence menu click handler.", err);
    if (typeof spiraAppManager !== 'undefined' && spiraAppManager.displayErrorMessage) {
        spiraAppManager.displayErrorMessage("SpiraApp critical error during setup. Menu button may not work.");
    }
}

// ==================================================================================
// Main Function - Called When Button is Clicked
// ==================================================================================
function handleConfluenceLink() {
    console.log("Confluence > Handle Link button clicked.");
    const linkFieldName = SpiraAppSettings[APP_GUID]?.confluenceLinkFieldName;

    if (!linkFieldName || !linkFieldName.startsWith("Custom_")) {
        spiraAppManager.displayErrorMessage("SpiraApp Config Error: 'Link Custom Field Name' (e.g., Custom_10) setting is missing or invalid in Product Settings.");
        return;
    }
    console.log(`Checking custom field: ${linkFieldName}`);

    let existingUrl = "";
    try {
        existingUrl = spiraAppManager.getDataItemField(linkFieldName, "textValue");
    } catch (err) {
        console.warn(`Could not read custom field '${linkFieldName}' using getDataItemField: ${err.message}. This can happen if the field isn't on the page layout or has no value. Assuming empty.`);
        existingUrl = ""; // Default to empty if there's an error reading it
    }

    if (existingUrl && existingUrl.trim() !== "" && (existingUrl.toLowerCase().startsWith('http://') || existingUrl.toLowerCase().startsWith('https://'))) {
        console.log(`Found existing URL: ${existingUrl}. Opening in new tab...`);
        window.open(existingUrl, '_blank');
    } else {
        if (existingUrl && existingUrl.trim() !== "") {
            console.warn(`Value in '${linkFieldName}' ('${existingUrl}') is present but not a valid http/https URL. Proceeding to create new page.`);
        }
        console.log(`Custom field '${linkFieldName}' is empty or does not contain a valid URL. Initiating Confluence page creation and Spira update flow...`);
        createConfluencePageAndLinkToSpira(linkFieldName);
    }
}

// ==================================================================================
// Orchestrator for Creating Confluence Page & Then Kicking Off Spira Form Update
// ==================================================================================
function createConfluencePageAndLinkToSpira(spiraLinkFieldName) {
    console.log("Create Confluence Page Flow: Started.");

    // Retrieve necessary IDs and settings
    const requirementId = spiraAppManager.artifactId;
    const requirementName = spiraAppManager.getDataItemField("Name", "textValue"); // Assumes "Name" field is always available
    const projectId = spiraAppManager.projectId;

    const confluenceBaseUrlFromSettings = SpiraAppSettings[APP_GUID]?.confluenceBaseUrl;
    const spaceKey = SpiraAppSettings[APP_GUID]?.confluenceSpaceKey;
    const parentPageIdSetting = SpiraAppSettings[APP_GUID]?.confluenceParentPageId; // Manifest defines as integer type

    // Use window.location.origin for Spira's public base URL for the link-back
    const spiraPublicBaseUrl = window.location.origin.replace(/\/$/, ''); // Ensure no trailing slash
    console.log("Using Spira Base URL for link-back construction:", spiraPublicBaseUrl);

    // Basic validation for required settings and data
    if (!requirementId) { spiraAppManager.displayErrorMessage("SpiraApp Error: Could not retrieve current Requirement ID."); return; }
    if (!requirementName) { spiraAppManager.displayErrorMessage("SpiraApp Error: Could not retrieve Requirement Name."); return; }
    if (!projectId) { spiraAppManager.displayErrorMessage("SpiraApp Error: Could not retrieve current Project ID."); return; }
    if (!confluenceBaseUrlFromSettings) { spiraAppManager.displayErrorMessage("SpiraApp Config Error: 'Confluence Base URL' system setting is missing."); return; }
    if (!spaceKey) { spiraAppManager.displayErrorMessage("SpiraApp Config Error: 'Target Confluence Space Key' product setting is missing."); return; }
    // Credentials (confluenceApiEmail, confluenceApiToken) are handled by spiraAppManager.executeRest using tokens from settings.

    const cleanConfluenceBaseUrl = confluenceBaseUrlFromSettings.replace(/\/$/, ''); // Ensure no trailing slash
    const confluenceApiEndpoint = `${cleanConfluenceBaseUrl}/wiki/rest/api/content`;

    // Construct the HTML content for the new Confluence page, linking back to the Spira Requirement
    const spiraLinkHtml = `<p>This page is linked to Spira Requirement <a href="${spiraPublicBaseUrl}/#/project/${projectId}/requirement/${requirementId}">${requirementName} (REQ:${requirementId})</a>.</p><p>Further details about the requirement can be found by following the link back to Spira.</p>`;
    console.log("DEBUG: Link-back HTML for Confluence page:", spiraLinkHtml);

    let requestBody = {
        type: "page",
        title: `[REQ:${requirementId}] ${requirementName}`, // Confluence page title
        space: { key: spaceKey },
        body: {
            storage: { // Confluence storage format
                value: spiraLinkHtml,
                representation: "storage"
            }
        }
    };

    // Add parent page ID if provided and valid
    if (parentPageIdSetting && typeof parentPageIdSetting === 'number' && parentPageIdSetting > 0) {
        requestBody.ancestors = [{ id: parentPageIdSetting }]; // API expects integer
    } else if (parentPageIdSetting && typeof parentPageIdSetting === 'string' && parentPageIdSetting.trim() !== "") { // Handle if it was somehow passed as string
        const parsedParentId = parseInt(parentPageIdSetting.trim(), 10);
        if (!isNaN(parsedParentId) && parsedParentId > 0) {
            requestBody.ancestors = [{ id: parsedParentId }];
        } else {
            console.warn(`Configured 'Target Parent Page ID' ('${parentPageIdSetting}') is not a valid positive integer. New page will be created at the space root.`);
        }
    }

    const credentialsForConfluence = { userName: "{confluenceApiEmail}", password: "{confluenceApiToken}" }; // Tokens resolved by executeRest
    const headers = { "Content-Type": "application/json", "Accept": "application/json" };

    console.log("DEBUG Confluence API Call - Endpoint:", confluenceApiEndpoint);
    console.log("DEBUG Confluence API Call - Headers:", JSON.stringify(headers));
    console.log("DEBUG Confluence API Call - Body:", JSON.stringify(requestBody));

    spiraAppManager.displaySuccessMessage("Attempting to create page in Confluence..."); // Temporary message, will be hidden

    // --- Call Confluence API using spiraAppManager.executeRest ---
    spiraAppManager.executeRest(
        APP_GUID, // SpiraApp's GUID
        "ConfluenceSpiraApp_CreatePage", // Name for logging
        "POST", // HTTP method
        confluenceApiEndpoint, // URL
        JSON.stringify(requestBody), // Body
        credentialsForConfluence, // Credentials object with tokens
        headers, // Headers
        function(confluenceResponseWrapper) { // SUCCESS CALLBACK (Confluence Page Creation)
            console.log("Confluence page creation - RAW Response Wrapper from Spira server:", confluenceResponseWrapper);
            let newPageUrl = ""; // Initialize for this scope

            try {
                if (!confluenceResponseWrapper || typeof confluenceResponseWrapper.content !== 'string' || confluenceResponseWrapper.content.trim() === "") {
                    throw new Error("Confluence API response content from Spira server is missing, empty, or not a string.");
                }
                // The actual Confluence response is nested inside the 'content' property of the wrapper
                const parsedConfluenceContent = JSON.parse(confluenceResponseWrapper.content);
                console.log("Parsed Confluence API Response Content:", parsedConfluenceContent);

                // Construct the user-friendly URL to the new Confluence page
                if (parsedConfluenceContent._links?.base && parsedConfluenceContent._links?.webui) {
                    newPageUrl = parsedConfluenceContent._links.base + parsedConfluenceContent._links.webui;
                } else if (parsedConfluenceContent.id && parsedConfluenceContent.space?.key) { // Construct from id and space key if standard links are missing
                    newPageUrl = `${cleanConfluenceBaseUrl}/wiki/spaces/${parsedConfluenceContent.space.key}/pages/${parsedConfluenceContent.id}`;
                } else if (parsedConfluenceContent.id) { // Fallback: use configured spaceKey if response doesn't include it (less ideal)
                     newPageUrl = `${cleanConfluenceBaseUrl}/wiki/spaces/${spaceKey}/pages/${parsedConfluenceContent.id}`;
                } else {
                    throw new Error("Parsed Confluence response is missing expected _links or id to construct the page URL.");
                }

                console.log("Determined new Confluence page URL:", newPageUrl);
                spiraAppManager.hideMessage(); // Hide the "Attempting to create..." message

                // Update the Spira form field with the new URL
                updateSpiraRequirementFormField(spiraLinkFieldName, newPageUrl);

            } catch (e) {
                spiraAppManager.displayErrorMessage("Confluence page may have been created, but an error occurred while processing the Confluence response or determining its URL. Please check Confluence manually.");
                console.error("Error processing Confluence response:", e, "Raw wrapper content:", confluenceResponseWrapper?.content);
                // Optionally, try to open Confluence to the space as a fallback
                if (cleanConfluenceBaseUrl && spaceKey) { window.open(cleanConfluenceBaseUrl + '/wiki/spaces/' + spaceKey, '_blank'); }
            }
        },
        function(errorStatus, errorThrown) { // ERROR CALLBACK (Confluence Page Creation)
            console.error("Confluence Page Creation API call failed - Status from Spira Server:", errorStatus, "Error/Exception:", errorThrown);
            let displayError = "Failed to create Confluence page via API.";
            if (errorStatus && errorStatus.responseText) { // Spira's wrapper for a failed REST call might have details here
                try {
                    const errResp = JSON.parse(errorStatus.responseText); // This might be Spira's error structure
                    if (errResp.Message) displayError += ` Details: ${errResp.Message}`;
                    else if (errResp.ExceptionMessage) displayError += ` Details: ${errResp.ExceptionMessage}`; // Another common Spira error property
                } catch (e) { /* Could not parse Spira's error response, use raw if short */ displayError += " Could not parse error details from server."; }
            } else if (errorThrown) { // This might be a network error or a string description
                displayError += ` Error description: ${errorThrown}`;
            }
            spiraAppManager.displayErrorMessage(displayError);
        }
    );
}

// ==================================================================================
// Function to Update Spira Requirement Form Field (using updateFormField)
// ==================================================================================
function updateSpiraRequirementFormField(fieldName, newPageUrl) {
    console.log(`Attempting to update Spira form field '${fieldName}' with URL: ${newPageUrl}`);
    try {
        // The dataProperty for a text custom field is typically "StringValue" for the API model,
        // but for updateFormField, it might also be "textValue" or just the direct value.
        // Let's try "StringValue" first as it's more aligned with the custom property structure.
        // If that doesn't work, "textValue" would be the next to try.
        //spiraAppManager.updateFormField(fieldName, "StringValue", newPageUrl); // Try a different value type
        spiraAppManager.updateFormField(fieldName, "textValue", newPageUrl);
        console.log(`Form field '${fieldName}' updated in UI with new URL.`);
        spiraAppManager.displaySuccessMessage(`Confluence page created. Link has been populated into the '${fieldName}' field on this form. Please click Spira's 'Save' button to persist this change.`);

        // Open the Confluence page in a new tab
        if (newPageUrl) {
            console.log("Opening newly created Confluence page in a new tab:", newPageUrl);
            window.open(newPageUrl, '_blank');
        }
    } catch (e) {
        console.error(`Error calling spiraAppManager.updateFormField for field '${fieldName}':`, e);
        spiraAppManager.displayErrorMessage(`Confluence page was created successfully (${newPageUrl}), but there was an error populating the link into the Spira form field '${fieldName}'. Error: ${e.message}. Please copy the URL and paste it manually into the field, then click 'Save'.`);
        // Still open the Confluence page so the user can at least access it
        if (newPageUrl) {
            window.open(newPageUrl, '_blank');
        }
    }
}


// ==================================================================================
// == ORIGINAL AUTOMATED SPIRA UPDATE APPROACH (via API PUT) ==
// The functions below (`updateSpiraRequirementLink_API`, 
// `WorkspacePropertyDefinitionIdFromTemplateAndProceed_API`, 
// and `getRequirementAndPutUpdate_API`) represent the original attempt to 
// automatically save the Confluence link back to the Spira Requirement 
// using a direct Spira REST API PUT request.
//
// This approach was paused due to:
// 1. Persistence Issue: API PUT returned 200 OK, but data wasn't saved.
// 2. SpiraApp Storage 500 Error: `storageGetProduct` failed with 500,
//    preventing reliable caching of PropertyDefinitionId.
// 3. Complexity: Managing ConcurrencyDate, payload, etc.
//
// This section is retained for documentation and potential future revisiting.
// ==================================================================================

/*
function updateSpiraRequirementLink_API(projectId, requirementId, fieldNameFromSetting, newPageUrl) {
    console.log(`(API Approach) Update Spira Flow: Initiated for Req ${requirementId}, Field ${fieldNameFromSetting}, URL ${newPageUrl}`);
    const definitionIdStorageKey = `confluenceLink_defId_for_${fieldNameFromSetting}`;
    const fieldNameCheckStorageKey = `confluenceLink_sourceFieldName_is_${fieldNameFromSetting}`;

    spiraAppManager.storageGetProduct(
        APP_GUID, "ConfluenceSpiraApp_StorageGet_DefId", definitionIdStorageKey, projectId,
        function(cachedDefIdString) { 
            let cachedDefId = parseInt(cachedDefIdString, 10);
            spiraAppManager.storageGetProduct(
                APP_GUID, "ConfluenceSpiraApp_StorageGet_FieldNameCheck", fieldNameCheckStorageKey, projectId,
                function(cachedStoredFieldName) { 
                    if (cachedDefId && !isNaN(cachedDefId) && cachedDefId > 0 && cachedStoredFieldName === fieldNameFromSetting) {
                        console.log(`(API Approach) Using cached PropertyDefinitionId: ${cachedDefId} for field ${fieldNameFromSetting}`);
                        getRequirementAndPutUpdate_API(projectId, requirementId, fieldNameFromSetting, newPageUrl, cachedDefId);
                    } else {
                        console.log(`(API Approach) Cached PropertyDefinitionId for ${fieldNameFromSetting} is invalid. Fetching from template.`);
                        fetchPropertyDefinitionIdFromTemplateAndProceed_API(projectId, requirementId, fieldNameFromSetting, newPageUrl, definitionIdStorageKey, fieldNameCheckStorageKey);
                    }
                },
                function(errStorageFieldName) { 
                    console.warn(`(API Approach) Could not retrieve fieldName check from storage. Error: ${JSON.stringify(errStorageFieldName)}. Fetching from template.`);
                    fetchPropertyDefinitionIdFromTemplateAndProceed_API(projectId, requirementId, fieldNameFromSetting, newPageUrl, definitionIdStorageKey, fieldNameCheckStorageKey);
                }
            );
        },
        function(errStorageDefId) { 
            console.warn(`(API Approach) PropertyDefinitionId for ${fieldNameFromSetting} not in product storage. Error: ${JSON.stringify(errStorageDefId)}. Fetching from template.`);
            fetchPropertyDefinitionIdFromTemplateAndProceed_API(projectId, requirementId, fieldNameFromSetting, newPageUrl, definitionIdStorageKey, fieldNameCheckStorageKey);
        }
    );
}

function fetchPropertyDefinitionIdFromTemplateAndProceed_API(projectId, requirementId, fieldNameFromSetting, newPageUrl, storageKeyForId, storageKeyForNameCheck) {
    const projectTemplateId = spiraAppManager.projectTemplateId;
    const artifactTypeIdForRequirement = 1; 
    const templateUrl = `project-templates/${projectTemplateId}/custom-properties/${artifactTypeIdForRequirement}`;

    console.log(`(API Approach) Fetching template custom prop defs from: ${templateUrl}`);

    spiraAppManager.executeApi(
        "ConfluenceSpiraApp_GetTemplateProps", "7.0", "GET", templateUrl, null,
        function(templateCustomProps) { 
            console.log("(API Approach) Template Custom Props API response:", templateCustomProps);
            let targetPropertyDefinitionId = null;

            if (templateCustomProps && Array.isArray(templateCustomProps)) {
                const foundDef = templateCustomProps.find(def => def.CustomPropertyFieldName === fieldNameFromSetting);
                if (foundDef && foundDef.CustomPropertyId) {
                    targetPropertyDefinitionId = foundDef.CustomPropertyId;
                    console.log(`(API Approach) Found PropertyDefinitionId for '${fieldNameFromSetting}' from template: ${targetPropertyDefinitionId}`);

                    spiraAppManager.storageInsertProduct(APP_GUID, "ConfluenceSpiraApp_StorageInsert_DefId", storageKeyForId, targetPropertyDefinitionId.toString(), projectId, false,
                        function() { console.log(`(API Approach) Stored PropertyDefinitionId ${targetPropertyDefinitionId} in product storage.`); },
                        function(err) { console.error(`(API Approach) Failed to store PropertyDefinitionId in product storage.`, err); }
                    );
                    spiraAppManager.storageInsertProduct(APP_GUID, "ConfluenceSpiraApp_StorageInsert_FieldNameCheck", storageKeyForNameCheck, fieldNameFromSetting, projectId, false,
                        function() { console.log(`(API Approach) Stored field name check '${fieldNameFromSetting}' in product storage.`); },
                        function(err) { console.error(`(API Approach) Failed to store field name check in product storage.`, err); }
                    );
                    
                    getRequirementAndPutUpdate_API(projectId, requirementId, fieldNameFromSetting, newPageUrl, targetPropertyDefinitionId);

                } else {
                    const errorMsg = `(API Approach) SpiraApp Config Error: Custom field '${fieldNameFromSetting}' NOT FOUND in product template.`;
                    console.error(errorMsg, "Available props:", templateCustomProps.map(p => p.CustomPropertyFieldName)); 
                    spiraAppManager.displayErrorMessage(errorMsg + " Cannot update Spira automatically.");
                    if (newPageUrl) { window.open(newPageUrl, '_blank'); }
                }
            } else { 
                console.error("(API Approach) Invalid response when fetching template custom properties:", templateCustomProps);
                spiraAppManager.displayErrorMessage("(API Approach) Error: Received invalid data for template custom properties. Cannot update Spira automatically.");
                if (newPageUrl) { window.open(newPageUrl, '_blank'); }
            }
        },
        function(getTemplateErrorStatus, getTemplateErrorThrown) { 
            console.error("(API Approach) Error GETting Template Custom Properties:", getTemplateErrorStatus, getTemplateErrorThrown);
            let errorDetail = "..."; // Simplified error detail
            spiraAppManager.displayErrorMessage(`(API Approach) Error fetching Spira template data. Details: ${errorDetail}. Cannot update Spira link automatically.`);
            if (newPageUrl) { window.open(newPageUrl, '_blank'); }
        }
    );
}

function getRequirementAndPutUpdate_API(projectId, requirementId, fieldNameFromSetting, newPageUrl, targetPropertyDefinitionId) {
    console.log(`(API Approach) Proceeding to GET Spira Req ${requirementId} for update with DefID ${targetPropertyDefinitionId}`);
    const requirementGetUrl = `projects/${projectId}/requirements/${requirementId}`;

    spiraAppManager.executeApi("ConfluenceSpiraApp_GetReq", "7.0", "GET", requirementGetUrl, null,
        function(requirementData) { 
            console.log("(API Approach) Original Spira Requirement data for update:", JSON.parse(JSON.stringify(requirementData))); 
            let updatePayload = { ...requirementData }; 
            
            if (!updatePayload.ConcurrencyDate) {
                console.error("(API Approach) CRITICAL ERROR: ConcurrencyDate is missing. Cannot safely PUT.");
                spiraAppManager.displayErrorMessage("(API Approach) Error: Missing ConcurrencyDate. Update aborted. URL: " + newPageUrl);
                if (newPageUrl) { window.open(newPageUrl, '_blank'); }
                return;
            }
            console.log("(API Approach) Using ConcurrencyDate for PUT:", updatePayload.ConcurrencyDate);

            if (!updatePayload.CustomProperties) { updatePayload.CustomProperties = []; }

            let customPropToUpdate = updatePayload.CustomProperties.find(
                p => ((p.Definition && p.Definition.CustomPropertyId === targetPropertyDefinitionId) || p.PropertyDefinitionId === targetPropertyDefinitionId)
            );

            if (customPropToUpdate) {
                customPropToUpdate.StringValue = newPageUrl;
                customPropToUpdate.IntegerValue = null; customPropToUpdate.BooleanValue = null;
                customPropToUpdate.DateTimeValue = null; customPropToUpdate.DecimalValue = null;
                customPropToUpdate.IntegerListValue = null;
            } else {
                updatePayload.CustomProperties.push({
                    PropertyDefinitionId: targetPropertyDefinitionId,
                    PropertyName: fieldNameFromSetting, 
                    StringValue: newPageUrl,
                    IntegerValue: null, BooleanValue: null, DateTimeValue: null, DecimalValue: null,
                    IntegerListValue: null 
                });
            }

            updatePayload.CustomProperties = updatePayload.CustomProperties.map(prop => {
                let defId = prop.PropertyDefinitionId; 
                if (!defId && prop.Definition && prop.Definition.CustomPropertyId) {
                    defId = prop.Definition.CustomPropertyId;
                }
                if (!defId && prop.PropertyName === fieldNameFromSetting) {
                     defId = targetPropertyDefinitionId;
                }
                let flatProp = { PropertyDefinitionId: defId };
                if (prop.StringValue !== undefined && prop.StringValue !== null) flatProp.StringValue = prop.StringValue;
                // ... (include other value types if they have values) ...
                if (prop.Definition && prop.Definition.CustomPropertyFieldName) {
                    flatProp.PropertyName = prop.Definition.CustomPropertyFieldName;
                } else if (prop.PropertyName) {
                    flatProp.PropertyName = prop.PropertyName;
                }
                return flatProp;
            }).filter(p => p.PropertyDefinitionId != null && p.PropertyDefinitionId > 0); 

            const fieldsToRemove = [
                "Steps", "ProjectGuid", "AuthorGuid", "OwnerGuid", "ReleaseGuid", "AuthorName",
                "OwnerName", "StatusName", "ImportanceName", "ProjectName", "RequirementTypeName",
                "ReleaseVersionNumber", "IndentLevel", "CoverageCountTotal", "CoverageCountPassed", 
                "CoverageCountFailed", "CoverageCountCaution", "CoverageCountBlocked", "TaskEstimatedEffort", 
                "TaskActualEffort", "TaskCount", "PercentComplete", "IsSuspect", "Summary", "IsAttachments",
                "Tags", "Guid", "ArtifactTypeId", "ProjectGroupName", "Definition", "LastUpdateDate" // Added LastUpdateDate
            ];
            fieldsToRemove.forEach(field => delete updatePayload[field]);

             if (updatePayload.CustomProperties) {
                updatePayload.CustomProperties.forEach(cp => { delete cp.Definition; });
            }

            console.log("(API Approach) Final Prepared Spira Update Payload:", JSON.stringify(updatePayload, null, 2));
            const updateUrl = `projects/${projectId}/requirements`; 

            spiraAppManager.executeApi("ConfluenceSpiraApp_UpdateReq", "7.0", "PUT", updateUrl, JSON.stringify(updatePayload),
                function(updateResponse) { 
                    console.log("(API Approach) Spira Req custom field update API successful. Response:", updateResponse); 
                    spiraAppManager.displaySuccessMessage("(API Approach) Confluence page created and Spira link successfully updated!");
                    
                    console.log("(API Approach) Reloading Spira form...");
                    spiraAppManager.reloadForm(); 

                    if (newPageUrl) {
                        console.log("(API Approach) Opening Confluence page (Spira PUT success):", newPageUrl);
                        setTimeout(() => { window.open(newPageUrl, '_blank'); }, 250);
                    }
                },
                function(spiraUpdateErrorStatus, spiraUpdateErrorThrown) { 
                    console.error("(API Approach) Error updating Spira Req via API:", spiraUpdateErrorStatus, spiraUpdateErrorThrown);
                    let errorDetail = "..."; // Simplified
                    spiraAppManager.displayWarningMessage(`(API Approach) Confluence page created. Failed to update Spira link. Error: ${errorDetail}. Please update manually: ${newPageUrl}`);
                    if (newPageUrl) { window.open(newPageUrl, '_blank'); }
                }
            );
        },
        function(getReqErrorStatus, getReqErrorThrown) { 
            console.error("(API Approach) Error GETting Spira Req before update:", getReqErrorStatus, getReqErrorThrown);
            let errorDetail = "..."; // Simplified
            spiraAppManager.displayWarningMessage(`(API Approach) Confluence page created. Couldn't get Spira data to update. Error: ${errorDetail}. Link manually: ${newPageUrl}`);
            if (newPageUrl) { window.open(newPageUrl, '_blank'); }
        }
    );
}
*/