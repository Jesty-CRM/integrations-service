<?php

/**
 * Fired when the plugin is uninstalled.
 *
 * When populating this file, consider the following flow
 * of control:
 *
 * - This method should be static
 * - Check if the $_REQUEST content actually is the plugin name
 * - Run an admin referrer check to make sure it goes through authentication
 * - Verify the output of $_GET makes sense
 * - Repeat with other user roles. Best directly by using the links/query string parameters.
 * - Repeat things for multisite. Once for a single site in the network, once sitewide.
 *
 * This file may be updated more in future version of the Boilerplate; however, this is the
 * general skeleton and outline for how the file should work.
 *
 * For more information, see the following discussion:
 * https://github.com/tommcfarlin/WordPress-Plugin-Boilerplate/pull/123#issuecomment-28541913
 *
 * @link       https://jesty-crm.vercel.app
 * @since      1.0.0
 *
 * @package    JestyCRM
 */

// If uninstall not called from WordPress, then exit.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * Clean up plugin data on uninstall
 */
function jcrm_uninstall_plugin() {
	// Remove plugin options
	delete_option( 'jcrm_integration_key' );
	delete_option( 'jcrm_webhook_url' );
	delete_option( 'jcrm_enabled_forms' );
	delete_option( 'jcrm_auto_mapping_enabled' );
	delete_option( 'jcrm_default_field_mappings' );
	delete_option( 'jcrm_form_mappings' );
	delete_option( 'jcrm_submission_stats' );
	delete_option( 'jcrm_plugin_version' );
	delete_option( 'jcrm_db_version' );
	delete_option( 'jcrm_site_configured' );
	delete_option( 'jcrm_configured_for_site' );

	// Remove transients
	delete_transient( 'jcrm_detected_forms' );
	delete_transient( 'jcrm_connection_status' );

	// Remove scheduled events
	wp_clear_scheduled_hook( 'jcrm_daily_cleanup' );

	// Drop plugin tables
	jcrm_drop_plugin_tables();

	// Clear any cached data
	wp_cache_flush();
}

/**
 * Drop plugin database tables
 */
function jcrm_drop_plugin_tables() {
	global $wpdb;

	// Drop submissions table
	$table_name = $wpdb->prefix . 'jcrm_submissions';
	$wpdb->query( "DROP TABLE IF EXISTS $table_name" );

	// Remove any other plugin tables here
}

// Run uninstall
jcrm_uninstall_plugin();