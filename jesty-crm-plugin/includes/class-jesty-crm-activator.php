<?php

/**
 * Fired during plugin activation
 *
 * @link       https://web.jestycrm.com
 * @since      1.0.0
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 */

/**
 * Fired during plugin activation.
 *
 * This class defines all code necessary to run during the plugin's activation.
 *
 * @since      1.0.0
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 * @author     Jesty CRM Team
 */
class JCRM_Activator {

	/**
	 * Short Description. (use period)
	 *
	 * Long Description.
	 *
	 * @since    1.0.0
	 */
	public function activate() {
		// Create database tables if needed
		$database = new JCRM_Database();
		$database->create_tables();

		// Set default options
		$this->set_default_options();

		// Clear any existing caches
		flush_rewrite_rules();
	}

	/**
	 * Set default plugin options
	 *
	 * @since    1.0.0
	 * @access   private
	 */
	private function set_default_options() {
		// Set default auto-mapping configuration
		if ( ! get_option( 'jcrm_auto_mapping_enabled' ) ) {
			update_option( 'jcrm_auto_mapping_enabled', true );
		}

		// Set default field mappings
		if ( ! get_option( 'jcrm_default_field_mappings' ) ) {
			$default_mappings = array(
				'name_fields' => array( 'name', 'your-name', 'full_name', 'fullname', 'first_name', 'last_name' ),
				'email_fields' => array( 'email', 'your-email', 'email_address', 'e_mail', 'user_email' ),
				'phone_fields' => array( 'phone', 'your-phone', 'telephone', 'mobile', 'phone_number', 'contact_number' ),
				'message_fields' => array( 'message', 'your-message', 'comments', 'inquiry', 'description', 'details' ),
				'company_fields' => array( 'company', 'organization', 'business_name', 'company_name' ),
				'subject_fields' => array( 'subject', 'your-subject', 'topic', 'title' )
			);
			update_option( 'jcrm_default_field_mappings', $default_mappings );
		}

		// Initialize statistics
		if ( ! get_option( 'jcrm_submission_stats' ) ) {
			update_option( 'jcrm_submission_stats', array(
				'total_submissions' => 0,
				'successful_submissions' => 0,
				'failed_submissions' => 0,
				'last_submission' => null
			));
		}

		// Set plugin version
		update_option( 'jcrm_plugin_version', JCRM_VERSION );
	}
}