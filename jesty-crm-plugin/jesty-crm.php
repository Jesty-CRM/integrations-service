<?php

/**
 * The plugin bootstrap file
 *
 * This file is read by WordPress to generate the plugin information in the plugin
 * admin area. This file also includes all of the dependencies used by the plugin,
 * registers the activation and deactivation functions, and defines a function
 * that starts the plugin.
 *
 * @link             https://jesty-crm.vercel.app
 * @since            1.0.0
 * @package          JestyCRM
 *
 * @wordpress-plugin
 * Plugin Name:       Jesty CRM Integration
 * Plugin URI:        https://jesty-crm.vercel.app/
 * Description:       Automatically send form submissions from your WordPress site to Jesty CRM. Supports all major form plugins with intelligent auto-mapping.
 * Version:           1.0.0
 * Author:            Jesty CRM
 * Author URI:        https://jesty-crm.vercel.app
 * License:           GPL-2.0+
 * License URI:       http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain:       jesty-crm
 * Domain Path:       /languages
 */

// If this file is called directly, abort.
if ( ! defined( 'WPINC' ) ) {
	die;
}

// Plugin version
define( 'JCRM_VERSION', '1.0.0' );

// Plugin name
define( 'JCRM_PLUGIN_NAME', 'Jesty CRM Integration' );

// Settings slug
define( 'JCRM_SETTINGS_SLUG', 'jesty-crm' );

// Nonce for security
define( 'JCRM_NONCE', 'JESTY_CRM_MAPPINGS' );

// API routes namespace
define( 'JCRM_ROUTES_NAMESPACE', 'jesty-crm/v1' );

// Plugin URL and path
define( 'JCRM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'JCRM_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );

/**
 * The code that runs during plugin activation.
 * This action is documented in includes/class-jesty-crm-activator.php
 */
function jcrm_activate_plugin() {
	require_once plugin_dir_path( __FILE__ ) . 'includes/class-jesty-crm-activator.php';
	$plugin_activator = new JCRM_Activator();
	$plugin_activator->activate();
	
	// Set default API base URL to ngrok endpoint
	if ( ! get_option( 'jcrm_api_base_url' ) ) {
		update_option( 'jcrm_api_base_url', 'https://1661e83ca323.ngrok-free.app' );
	}
}

/**
 * The code that runs during plugin deactivation.
 * This action is documented in includes/class-jesty-crm-deactivator.php
 */
function jcrm_deactivate_plugin() {
	require_once plugin_dir_path( __FILE__ ) . 'includes/class-jesty-crm-deactivator.php';
	JCRM_Deactivator::jcrm_deactivate();
}

/**
 * Permissions callback for REST API endpoints
 */
function jcrm_get_permissions() {
	return true;
}

/**
 * Register REST API routes for Jesty CRM
 */
function jcrm_register_routes() {
	// Test connection endpoint
	register_rest_route( JCRM_ROUTES_NAMESPACE, '/test-connection',
		[
			'methods' => 'POST',
			'callback' => 'jcrm_test_connection',
			'permission_callback' => 'jcrm_get_permissions',
		]
	);

	// Get form mappings
	register_rest_route( JCRM_ROUTES_NAMESPACE, '/mappings/', [
		'methods' => 'GET',
		'callback' => 'jcrm_get_stored_mappings',
		'permission_callback' => 'jcrm_get_permissions',
	] );

	// Save form mappings
	register_rest_route( JCRM_ROUTES_NAMESPACE, '/mappings/', [
		'methods' => 'POST',
		'callback' => 'jcrm_save_mappings',
		'permission_callback' => 'jcrm_get_permissions',
	] );

	// Get plugin statistics
	register_rest_route( JCRM_ROUTES_NAMESPACE, '/stats/', [
		'methods' => 'GET',
		'callback' => 'jcrm_get_stats',
		'permission_callback' => 'jcrm_get_permissions',
	] );
}

/**
 * Test connection to Jesty CRM
 */
function jcrm_test_connection( $request ) {
	require_once JCRM_PLUGIN_PATH . 'includes/class-jesty-crm-api.php';
	$api_client = new JCRM_API_Client();
	$result = $api_client->test_connection();
	return rest_ensure_response( $result );
}

/**
 * Get stored form mappings
 */
function jcrm_get_stored_mappings( $request ) {
	$response = apply_filters( 'jcrm_get_stored_mappings', array() );
	return rest_ensure_response( $response );
}

/**
 * Save form mappings
 */
function jcrm_save_mappings( $request ) {
	return apply_filters( 'jcrm_save_mappings', $request );
}

/**
 * Get plugin statistics
 */
function jcrm_get_stats( $request ) {
	require_once JCRM_PLUGIN_PATH . 'includes/class-jesty-crm-api.php';
	$api_client = new JCRM_API_Client();
	$stats = $api_client->get_integration_stats();
	return rest_ensure_response( $stats );
}

register_activation_hook( __FILE__, 'jcrm_activate_plugin' );
register_deactivation_hook( __FILE__, 'jcrm_deactivate_plugin' );

/**
 * The core plugin class that is used to define internationalization,
 * admin-specific hooks, and public-facing site hooks.
 */
require plugin_dir_path( __FILE__ ) . 'includes/class-jesty-crm.php';

/**
 * Begins execution of the plugin.
 *
 * Since everything within the plugin is registered via hooks,
 * then kicking off the plugin from this point in the file does
 * not affect the page life cycle.
 *
 * @since    1.0.0
 */
function run_jesty_crm() {
	$plugin = new JestyCRM();
	$plugin->run();
	add_action( 'rest_api_init', 'jcrm_register_routes', 1, 0 );
}

run_jesty_crm();