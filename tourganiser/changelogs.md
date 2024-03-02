# Changelogs

## Alpha Development

### Patch 0.24.02.10.0
Initial creation of the project using flutter.

### Patch 0.24.02.10.1
 - Started working on the general layout of the UI
 - Planned and started working on the UI for the "Create tournament" page
 - Navigating and expanding the menu bar has been tested and is working
 - At the moment there is no functionality, only design elements

### Patch 0.24.02.11.0
 - Added individual code file for the Create Tournament page to keep the code legible and clean
 - Started work on the tournament creation form with basic validation (Currently not working as intended)

### Patch 0.24.02.12.0
 - Fixed the issue with the create form

### Patch 0.24.02.14.0
 - Added the validation check to the submit button on the create page
 - Added radio buttons for competition format
 - Added an error message if the create form isn't valid
 - Added form fields for number of teams and groups
 - Added a dropdown list for the elimination round selection

### Patch 0.24.02.14.1
 - Changed some texts for better readability
 - UI changes in create form

### Patch 0.24.02.15.0
 - UI changes for a more responsive app
 - changed the NavigationRail to a Drawer
 - added responsiveness to change the UI based on screen size
 - Started working on UI for smaller screens
 - Added all UI elements to smaller screen Layout that were in the larger screen layout
 - fixed the error that the dropdown list for the elimination round was giving
 - started working on the list to display the participating teams
 - created a custom ListTile widget for each team in the list

### Patch 0.24.02.16.0
 - changes to the custom team ListTile

### Patch 0.24.03.02.0
 - Moved the submit button from the create form to a FloatingActionButton on mobile version
 - Moved the submit button from create form to button in AppBar on desktop version
 - Started working on the AddTeamPopUp for create form