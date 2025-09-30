<?php

/**
 * The file that defines the core plugin class
 *
 * A class definition that includes attributes and functions used across both the
 * public-facing side of the site and the admin area.
 *
 * @link       https://jesty-crm.vercel.app
 * @since      1.0.0
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 */

/**
 * The core plugin class.
 *
 * This is used to define internationalization, admin-specific hooks, and
 * public-facing site hooks.
 *
 * Also maintains the unique identifier of this plugin as well as the current
 * version of the plugin.
 *
 * @since      1.0.0
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 * @author     Jesty CRM Team
 */
class JestyCRM {

	/**
	 * The loader that's responsible for maintaining and registering all hooks that power
	 * the plugin.
	 *
	 * @since    1.0.0
	 * @access   protected
	 * @var      JCRM_Loader    $loader    Maintains and registers all hooks for the plugin.
	 */
	protected $loader;

	/**
	 * The unique identifier of this plugin.
	 *
	 * @since    1.0.0
	 * @access   protected
	 * @var      string    $plugin_name    The string used to uniquely identify this plugin.
	 */
	protected $plugin_name;

	/**
	 * The current version of the plugin.
	 *
	 * @since    1.0.0
	 * @access   protected
	 * @var      string    $version    The current version of the plugin.
	 */
	protected $version;

	/**
	 * Define the core functionality of the plugin.
	 *
	 * Set the plugin name and the plugin version that can be used throughout the plugin.
	 * Load the dependencies, define the locale, and set the hooks for the admin area and
	 * the public-facing side of the site.
	 *
	 * @since    1.0.0
	 */
	public function __construct() {
		if ( defined( 'JCRM_VERSION' ) ) {
			$this->version = JCRM_VERSION;
		} else {
			$this->version = '1.0.0';
		}
		$this->plugin_name = JCRM_PLUGIN_NAME;

		$this->load_dependencies();
		$this->set_locale();
		$this->define_admin_hooks();
		$this->define_public_hooks();
	}

	/**
	 * Load the required dependencies for this plugin.
	 *
	 * Include the following files that make up the plugin:
	 *
	 * - JCRM_Loader. Orchestrates the hooks of the plugin.
	 * - JCRM_i18n. Defines internationalization functionality.
	 * - JCRM_Admin. Defines all hooks for the admin area.
	 * - JCRM_Public. Defines all hooks for the public side of the site.
	 *
	 * Create an instance of the loader which will be used to register the hooks
	 * with WordPress.
	 *
	 * @since    1.0.0
	 * @access   private
	 */
	private function load_dependencies() {

		/**
		 * The class responsible for orchestrating the actions and filters of the
		 * core plugin.
		 */
		require_once plugin_dir_path( dirname( __FILE__ ) ) . 'includes/class-jesty-crm-loader.php';

		/**
		 * The class responsible for defining internationalization functionality
		 * of the plugin.
		 */
		require_once plugin_dir_path( dirname( __FILE__ ) ) . 'includes/class-jesty-crm-i18n.php';

		/**
		 * The class responsible for defining all actions that occur in the admin area.
		 */
		require_once plugin_dir_path( dirname( __FILE__ ) ) . 'admin/class-jesty-crm-admin.php';

		/**
		 * The class responsible for defining all actions that occur in the public-facing
		 * side of the site.
		 */
		require_once plugin_dir_path( dirname( __FILE__ ) ) . 'public/class-jesty-crm-public.php';

		/**
		 * The class responsible for database operations.
		 */
		require_once plugin_dir_path( dirname( __FILE__ ) ) . 'includes/class-jesty-crm-database.php';

		/**
		 * The class responsible for API communication.
		 */
		require_once plugin_dir_path( dirname( __FILE__ ) ) . 'includes/class-jesty-crm-api.php';

		$this->loader = new JCRM_Loader();
	}

	/**
	 * Define the locale for this plugin for internationalization.
	 *
	 * Uses the JCRM_i18n class in order to set the domain and to register the hook
	 * with WordPress.
	 *
	 * @since    1.0.0
	 * @access   private
	 */
	private function set_locale() {
		$plugin_i18n = new JCRM_i18n();
		$this->loader->add_action( 'plugins_loaded', $plugin_i18n, 'load_plugin_textdomain' );
	}

	/**
	 * Register all of the hooks related to the admin area functionality
	 * of the plugin.
	 *
	 * @since    1.0.0
	 * @access   private
	 */
	private function define_admin_hooks() {
		$plugin_admin = new JCRM_Admin( $this->get_plugin_name(), $this->get_version() );

		$this->loader->add_action( 'admin_enqueue_scripts', $plugin_admin, 'enqueue_styles' );
		$this->loader->add_action( 'admin_enqueue_scripts', $plugin_admin, 'enqueue_scripts' );
		$this->loader->add_action( 'admin_menu', $plugin_admin, 'jcrm_add_plugin_settings' );
		$this->loader->add_action( 'admin_menu', $plugin_admin, 'jcrm_init' );
		$this->loader->add_action( 'wp_ajax_jcrm_save_mappings', $plugin_admin, 'jcrm_save_mappings' );
		$this->loader->add_action( 'wp_ajax_jcrm_get_mappings', $plugin_admin, 'jcrm_get_mappings' );
		$this->loader->add_action( 'wp_ajax_jcrm_test_connection', $plugin_admin, 'jcrm_test_connection' );
		$this->loader->add_action( 'wp_ajax_jcrm_toggle_form', $plugin_admin, 'jcrm_toggle_form' );
		$this->loader->add_action( 'wp_ajax_jcrm_refresh_forms', $plugin_admin, 'jcrm_refresh_forms' );
		$this->loader->add_action( 'wp_ajax_jcrm_get_stats', $plugin_admin, 'jcrm_get_stats' );
	}

	/**
	 * Register all of the hooks related to the public-facing functionality
	 * of the plugin.
	 *
	 * @since    1.0.0
	 * @access   private
	 */
	private function define_public_hooks() {
		$plugin_public = new JCRM_Public( $this->get_plugin_name(), $this->get_version() );

		// Filter hooks
		$this->loader->add_filter( 'jcrm_get_stored_mappings', $plugin_public, 'jcrm_get_stored_mappings' );
		$this->loader->add_filter( 'jcrm_test_connection', $plugin_public, 'jcrm_test_connection' );
		$this->loader->add_filter( 'jcrm_save_mappings', $plugin_public, 'jcrm_save_mappings' );
		$this->loader->add_filter( 'jcrm_get_stats', $plugin_public, 'jcrm_get_stats' );

		// Public scripts
		$this->loader->add_action( 'wp_enqueue_scripts', $plugin_public, 'jcrm_enqueue_scripts' );

		// Form submission hooks - organized by priority
		$this->loader->add_action( 'wpcf7_before_send_mail', $plugin_public, 'jcrm_send_cf7_data', 10, 1 );
		$this->loader->add_action( 'wpforms_process_complete', $plugin_public, 'jcrm_send_wpform_data', 10, 4 );
		$this->loader->add_action( 'ninja_forms_after_submission', $plugin_public, 'jcrm_send_ninja_form_data', 10, 1 );
		$this->loader->add_action( 'gform_after_submission', $plugin_public, 'jcrm_send_gravity_data', 10, 2 );
		$this->loader->add_action( 'elementor_pro/forms/new_record', $plugin_public, 'jcrm_send_elementor_form_data', 10, 2 );
		$this->loader->add_action( 'frm_after_create_entry', $plugin_public, 'jcrm_send_formidable_data', 10, 2 );
		$this->loader->add_action( 'fluentform/submission_inserted', $plugin_public, 'jcrm_send_fluent_data', 10, 3 );
		$this->loader->add_action( 'everest_forms_complete_entry_save', $plugin_public, 'jcrm_send_everest_form_data', 10, 5 );
		$this->loader->add_action( 'forminator_custom_form_submit_before_set_fields', $plugin_public, 'jcrm_send_forminator_data', 10, 3 );
		$this->loader->add_action( 'metform_after_store_form_data', $plugin_public, 'jcrm_submit_metform_data', 10, 4 );
	}

	/**
	 * Run the loader to execute all of the hooks with WordPress.
	 *
	 * @since    1.0.0
	 */
	public function run() {
		$this->loader->run();
	}

	/**
	 * The name of the plugin used to uniquely identify it within the context of
	 * WordPress and to define internationalization functionality.
	 *
	 * @since     1.0.0
	 * @return    string    The name of the plugin.
	 */
	public function get_plugin_name() {
		return $this->plugin_name;
	}

	/**
	 * The reference to the class that orchestrates the hooks with the plugin.
	 *
	 * @since     1.0.0
	 * @return    JCRM_Loader    Orchestrates the hooks of the plugin.
	 */
	public function get_loader() {
		return $this->loader;
	}

	/**
	 * Retrieve the version number of the plugin.
	 *
	 * @since     1.0.0
	 * @return    string    The version number of the plugin.
	 */
	public function get_version() {
		return $this->version;
	}
}