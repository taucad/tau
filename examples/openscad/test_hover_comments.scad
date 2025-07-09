// Test file for hover behavior with comments
// This is a comment with the word "email" in it - should not show hover
/* This is a block comment with "email" inside - should not show hover */

/* [Wi-Fi Type] */
// Group comment above - hovering over "Wi-Fi Type" should show @group hover

/* [Network Settings] */
// Another group comment - hovering over "Network Settings" should show @group hover

// email address configuration
email = "test@example.org"; // This variable should show hover when hovering over "email"

// width of the cube
width = 10; // The word "width" here should show hover

/* [Device Configuration] */
// Group comment - hovering over "Device Configuration" should show @group hover

/*
  Multi-line comment block
  with the word "email" inside - should not show hover
  and also "width" - should not show hover
*/

module test_module(email = "default@example.com") {
    // Parameter email usage - this should show hover
    echo(email);
    
    // Comment mentioning email - should not show hover
    cube([width, width, width]);
}

// Test single line comment with email and width - neither should show hover
test_module();

// Test case for comma handling in variable values
city = "San Francisco";  // Valid variable declaration
coordinates = [1, 2, 3];  // Valid array declaration
message = str("Hello", ", ", "World");  // Valid function call with commas

// Test module with comma-separated parameters (where the original issue occurred)
module test_comma_params(
    city = "Default City",
    region = "Default Region", 
    postalcode = "00000"
) {
    echo(city, region, postalcode);
}

// Variables for testing multi-line parameter detection
first_name = "John";
last_name = "Doe"; 
phone_number = "555-1234";

// Test multi-line function call parameter detection (like the original qr_wifi example)
module create_vcard() {
    message = custom_vcard(
        first=first_name,      // Should show parameter hover for 'first', not variable hover
        last=last_name,        // Should show parameter hover for 'last'  
        phone=phone_number     // Should show parameter hover for 'phone'
    );
    echo(message);
}

// Test with a user-defined module that spans multiple lines
module custom_vcard(first="", last="", phone="") {
    str("Name: ", first, " ", last, " Phone: ", phone);
} 
