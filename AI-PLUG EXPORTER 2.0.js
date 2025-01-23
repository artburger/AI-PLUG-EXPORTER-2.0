// Create a new dialog window with improved styling
var dialog = new Window("dialog", "Export Artboards to PDF", undefined, { maximizeButton: true });
dialog.orientation = "column";
dialog.margins = 16;

// Create a scrollable group for artboard selection with improved styling
var scrollGroup = dialog.add("panel", undefined, "Select Artboards");
scrollGroup.orientation = "column";
scrollGroup.alignChildren = "left";
scrollGroup.margins = 10;

// Get the active document and artboards
var doc = app.activeDocument;
var artboards = doc.artboards;

// Create a listbox control for artboard selection with improved styling
var listBox = scrollGroup.add("listbox", undefined, "", { multiselect: true });
listBox.preferredSize.width = 300;
listBox.preferredSize.height = 300;

// Populate the listbox with artboard names
for (var i = 0; i < artboards.length; i++) {
    listBox.add("item", artboards[i].name);
}

// Add buttons to the dialog with improved styling and grouping
var buttonGroup = dialog.add("group");
buttonGroup.orientation = "row";
buttonGroup.alignment = "right";
buttonGroup.margins = [0, 10, 0, 0];

// Select/Deselect buttons group
var selectionGroup = buttonGroup.add("group");
selectionGroup.orientation = "row";
selectionGroup.alignment = "left";
selectionGroup.spacing = 10;

var selectAllButton = selectionGroup.add("button", undefined, "Select All");
selectAllButton.onClick = function() {
    selectAll(true);
};

var deselectAllButton = selectionGroup.add("button", undefined, "Deselect All");
deselectAllButton.onClick = function() {
    selectAll(false);
};


buttonGroup.add("statictext", undefined, ""); // Spacer

var exportButton = buttonGroup.add("button", undefined, "Export");
exportButton.onClick = exportArtboards;

var cancelButton = buttonGroup.add("button", undefined, "Cancel");
cancelButton.onClick = function() {
    dialog.close();
};

// Add export status text (initially hidden) with improved styling
var statusText = dialog.add("statictext", undefined, "Exporting... Please wait.");
statusText.alignment = "center";
statusText.visible = false;
statusText.characters = 12;


// Show the dialog
dialog.show();

// Helper functions
function selectAll(state) {
    for (var i = 0; i < listBox.items.length; i++) {
        listBox.items[i].selected = state;
    }
}

function exportArtboards() {
    var destFolder = new Folder(doc.path + "/AI@by#ME Export");
    if (!destFolder.exists) {
        destFolder.create();
    }

    var selectedArtboardIndices = [];
    for (var i = 0; i < listBox.items.length; i++) {
        if (listBox.items[i].selected) {
            selectedArtboardIndices.push(i);
        }
    }

    if (selectedArtboardIndices.length === 0) {
        alert("No artboards selected.");
        return;
    }

    toggleUI(false);
    statusText.visible = true;

    var exportedCount = 0;
    var exportTxtContent = "";

    for (var i = 0; i < selectedArtboardIndices.length; i++) {
        var artboardIndex = selectedArtboardIndices[i];
        var artboard = artboards[artboardIndex];
        var exportFile = new File(destFolder.fsName + "/" + artboard.name + ".pdf");
        var pdfSaveOptions = new PDFSaveOptions();
        pdfSaveOptions.artboardRange = (artboardIndex + 1).toString();
        pdfSaveOptions.preserveEditability = false;
        pdfSaveOptions.compatibility = PDFCompatibility.ACROBAT6;

        try {
            doc.saveAs(exportFile, pdfSaveOptions);
            exportTxtContent += (artboardIndex + 1) + ",";
            exportedCount++;
        } catch (e) {
            alert("Error exporting artboard " + artboard.name + ": " + e);
        }
    }

    if (exportedCount > 0) {
        var exportTxtFile = new File(destFolder.fsName + "/ArtboardList.txt");
        exportTxtFile.open("w");
        exportTxtFile.write(exportTxtContent.slice(0, -1));
        exportTxtFile.close();
        alert(exportedCount + " artboard(s) exported to 'AI@by#ME Export' folder.");
        destFolder.execute();
    }

    toggleUI(true);
    statusText.visible = false;
    dialog.close();
}


function toggleUI(enabled) {
    listBox.enabled = enabled;
    selectAllButton.enabled = enabled;
    deselectAllButton.enabled = enabled;
    exportButton.enabled = enabled;
    cancelButton.enabled = enabled;
}