<?php

/**
 * Fired during plugin deactivation
 *
 * @link       https://web.jestycrm.com
 * @since      1.0.0
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 */

/**
 * Fired during plugin deactivation.
 *
 * This class defines all code necessary to run during the plugin's deactivation.
 *
 * @since      1.0.0
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 * @author     Jesty CRM Team
 */
class JCRM_Deactivator {

	/**
	 * Short Description. (use period)
	 *
	 * Long Description.
	 *
	 * @since    1.0.0
	 */
	public static function jcrm_deactivate() {
		// Clear scheduled events if any
		wp_clear_scheduled_hook( 'jcrm_daily_cleanup' );

		// Clear any cached data
		delete_transient( 'jcrm_detected_forms' );
		delete_transient( 'jcrm_connection_status' );

		// Flush rewrite rules
		flush_rewrite_rules();

		// Note: We don't delete user data on deactivation
		// Only on uninstall (handled in uninstall.php)
	}
}