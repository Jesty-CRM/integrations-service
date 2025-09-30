=== Jesty CRM Integration ===
Contributors: jestycrm
Tags: crm, lead generation, forms, integration, contact form 7, wpforms, ninja forms, gravity forms
Requires at least: 5.0
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Automatically send form submissions from your WordPress site to Jesty CRM. Supports all major form plugins with intelligent auto-mapping.

== Description ==

Jesty CRM Integration plugin automatically captures form submissions from your WordPress website and sends them directly to your Jesty CRM system. No more manual data entry - every lead is automatically captured and assigned to your sales team.

= Supported Form Plugins =

* Contact Form 7
* WPForms
* Ninja Forms
* Gravity Forms
* Elementor Forms
* Formidable Forms
* Fluent Forms
* Everest Forms
* Forminator
* MetForm
* Custom HTML forms

= Key Features =

* **Automatic Form Detection** - The plugin automatically detects all supported forms on your website
* **Intelligent Auto-Mapping** - Common fields like name, email, phone, and message are automatically mapped
* **Real-time Sync** - Form submissions are sent to Jesty CRM instantly
* **Assignment Integration** - Leads are automatically assigned based on your CRM rules
* **Duplicate Detection** - Prevents duplicate leads from being created
* **Connection Testing** - Built-in tool to test your CRM connection
* **Detailed Statistics** - Track submission success rates and form performance
* **Custom Form Support** - Add the `jesty-crm` class to any form for manual integration
* **Database Logging** - All submissions are logged for debugging and analytics
* **Professional Architecture** - Built following WordPress coding standards

= Setup Instructions =

1. Install and activate the plugin
2. Go to Settings > Jesty CRM in your WordPress admin
3. Get your Integration Key and Webhook URL from your Jesty CRM WordPress integrations page
4. Enter the details and test the connection
5. Select which forms you want to sync
6. All form submissions will now be automatically sent to your CRM!

= Automatic Field Mapping =

The plugin uses intelligent auto-mapping to automatically detect and map common form fields:

* **Name fields** - first_name, last_name, name, your-name, full_name
* **Email fields** - email, your-email, email_address, e_mail
* **Phone fields** - phone, your-phone, telephone, mobile, phone_number
* **Message fields** - message, your-message, comments, inquiry, description
* **Company fields** - company, organization, business_name
* **Subject fields** - subject, your-subject, topic

= Custom Form Integration =

For custom HTML forms, simply add the `jesty-crm` class to your form element:

```html
<form class="jesty-crm" method="post">
    <input type="text" name="name" placeholder="Your Name" required>
    <input type="email" name="email" placeholder="Your Email" required>
    <textarea name="message" placeholder="Your Message"></textarea>
    <button type="submit">Submit</button>
</form>
```

= Professional Architecture =

This plugin is built with a professional, modular architecture:

* **MVC Pattern** - Separate admin, public, and core functionality
* **Hook System** - Proper WordPress hook implementation
* **Database Integration** - Custom tables for logging and analytics
* **Internationalization** - Ready for translation
* **Security First** - Nonce verification and data sanitization
* **Performance Optimized** - Efficient code and minimal resource usage

== Installation ==

1. Upload the plugin files to the `/wp-content/plugins/jesty-crm-integration` directory, or install the plugin through the WordPress plugins screen directly.
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Use the Settings > Jesty CRM screen to configure the plugin
4. Get your Integration Key and Webhook URL from your Jesty CRM dashboard
5. Test the connection and start capturing leads!

== Frequently Asked Questions ==

= Do I need a Jesty CRM account? =

Yes, you need an active Jesty CRM account to use this plugin. You can sign up at https://jesty-crm.vercel.app

= Which form plugins are supported? =

The plugin supports Contact Form 7, WPForms, Ninja Forms, Gravity Forms, Elementor Forms, Formidable Forms, Fluent Forms, Everest Forms, Forminator, MetForm, and custom HTML forms.

= How do I get my Integration Key? =

Log into your Jesty CRM dashboard, go to Integrations > WordPress, and create a new integration. Your Integration Key and Webhook URL will be provided.

= Can I map custom fields? =

Yes, while the plugin uses intelligent auto-mapping for common fields, you can configure custom field mapping from your Jesty CRM dashboard.

= What happens if a submission fails? =

Failed submissions are logged in the database and you can see statistics in the plugin settings. The plugin will continue to attempt sending other submissions.

= Is my data secure? =

Yes, all data is transmitted securely using HTTPS and your Integration Key acts as authentication. The plugin follows WordPress security best practices.

= Can I see submission history? =

Yes, the plugin includes a statistics dashboard showing total submissions, success/failure rates, and last submission time.

== Screenshots ==

1. Plugin settings page with connection configuration
2. Detected forms and sync settings
3. Connection test interface
4. Submission statistics dashboard
5. Welcome screen for new users
6. Auto-mapping configuration

== Changelog ==

= 1.0.0 =
* Initial release
* Support for major form plugins
* Intelligent auto-mapping
* Real-time sync with Jesty CRM
* Connection testing
* Statistics tracking
* Custom form support
* Professional plugin architecture
* Database logging
* Internationalization support

== Upgrade Notice ==

= 1.0.0 =
Initial release of Jesty CRM Integration plugin with professional architecture and comprehensive form support.

== Developer Notes ==

= Plugin Architecture =

This plugin follows WordPress coding standards and best practices:

* **Namespace**: All functions and classes prefixed with `jcrm_` or `JCRM_`
* **Hook System**: Proper use of WordPress actions and filters
* **Security**: Nonce verification, capability checks, and data sanitization
* **Database**: Custom tables with proper schema and cleanup
* **Internationalization**: All strings ready for translation
* **Performance**: Optimized queries and minimal resource usage

= Custom Integration =

Developers can extend the plugin using WordPress hooks:

```php
// Add custom form support
add_action('my_custom_form_submit', function($form_data) {
    do_action('jcrm_send_lead_data', $form_data);
});

// Filter form data before sending
add_filter('jcrm_form_data', function($data) {
    // Modify data before sending to CRM
    return $data;
});
```

== Support ==

For support, please visit our documentation at https://jesty-crm.vercel.app/docs or contact our support team.

== Privacy Policy ==

This plugin sends form submission data to Jesty CRM servers for processing. Please ensure you have appropriate consent from your users and comply with applicable privacy laws like GDPR.