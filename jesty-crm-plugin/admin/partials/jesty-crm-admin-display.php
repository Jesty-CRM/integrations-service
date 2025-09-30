<?php

/**
 * Provide a admin area view for the plugin
 *
 * This file is used to markup the admin-facing aspects of the plugin.
 *
 * @link      https://jesty-crm.vercel.app
 * @since     1.0.0
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/admin/partials
 */

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$integration_key = get_option( 'jcrm_integration_key', '' );
$webhook_url = get_option( 'jcrm_webhook_url', '' );
$enabled_forms = get_option( 'jcrm_enabled_forms', array() );
$is_configured = !empty( $integration_key ) && !empty( $webhook_url );
?>

<div class="wrap jesty-crm-admin">
	<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

	<?php if ( isset( $_GET['settings-updated'] ) && $_GET['settings-updated'] ): ?>
		<div class="notice notice-success is-dismissible">
			<p><?php _e( 'Settings saved successfully!', 'jesty-crm' ); ?></p>
		</div>
	<?php endif; ?>

	<!-- Welcome Screen (shown if not configured) -->
	<?php if ( ! $is_configured ): ?>
	<div id="jcrm-welcome-screen" class="jesty-crm-card">
		<div style="text-align: center; padding: 40px 20px;">
			<img src="<?php echo JCRM_PLUGIN_URL; ?>admin/assets/jesty-crm-logo.png" alt="Jesty CRM" style="max-width: 200px; margin-bottom: 20px;" onerror="this.style.display='none'">
			<h2><?php _e( 'Welcome to Jesty CRM Integration', 'jesty-crm' ); ?></h2>
			<p><?php _e( 'Connect your WordPress forms to Jesty CRM and start capturing leads automatically.', 'jesty-crm' ); ?></p>
			
			<div class="jesty-setup-steps">
				<h3><?php _e( 'Quick Setup Guide', 'jesty-crm' ); ?></h3>
				<ol>
					<li><?php _e( 'Log into your Jesty CRM account', 'jesty-crm' ); ?></li>
					<li><?php _e( 'Go to Integrations → WordPress', 'jesty-crm' ); ?></li>
					<li><?php _e( 'Create a new WordPress integration', 'jesty-crm' ); ?></li>
					<li><?php _e( 'Copy your Integration Key and Webhook URL', 'jesty-crm' ); ?></li>
					<li><?php _e( 'Enter the details below and test the connection', 'jesty-crm' ); ?></li>
					<li><?php _e( 'Select which forms you want to sync', 'jesty-crm' ); ?></li>
				</ol>
			</div>

			<button type="button" class="button button-primary button-large" onclick="document.getElementById('jcrm-configuration').scrollIntoView();">
				<?php _e( 'Get Started', 'jesty-crm' ); ?>
			</button>
		</div>
	</div>
	<?php endif; ?>

	<!-- Configuration Section -->
	<div id="jcrm-configuration" class="jesty-crm-card">
		<h2><?php _e( 'Connection Settings', 'jesty-crm' ); ?></h2>
		
		<?php if ( $is_configured ): ?>
			<div class="jesty-connection-status connected">
				<?php _e( 'Connected', 'jesty-crm' ); ?>
			</div>
		<?php else: ?>
			<div class="jesty-connection-status disconnected">
				<?php _e( 'Not Connected', 'jesty-crm' ); ?>
			</div>
		<?php endif; ?>

		<form method="post" action="options.php" id="jcrm-settings-form">
			<?php settings_fields( 'jcrm_settings_group' ); ?>
			
			<table class="form-table">
				<tr>
					<th scope="row"><?php _e( 'Integration Key', 'jesty-crm' ); ?></th>
					<td>
						<input type="text" name="jcrm_integration_key" id="jcrm_integration_key" 
							   value="<?php echo esc_attr( $integration_key ); ?>" 
							   class="regular-text" required />
						<p class="description">
							<?php _e( 'Your unique integration key from Jesty CRM WordPress integrations page.', 'jesty-crm' ); ?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php _e( 'Webhook URL', 'jesty-crm' ); ?></th>
					<td>
						<input type="url" name="jcrm_webhook_url" id="jcrm_webhook_url" 
							   value="<?php echo esc_attr( $webhook_url ); ?>" 
							   class="regular-text" required />
						<p class="description">
							<?php _e( 'The webhook URL provided by Jesty CRM for receiving form submissions.', 'jesty-crm' ); ?>
						</p>
					</td>
				</tr>
			</table>

			<div style="margin: 20px 0;">
				<button type="button" id="jcrm-test-connection" class="button button-secondary">
					<?php _e( 'Test Connection', 'jesty-crm' ); ?>
				</button>
				<?php submit_button( __( 'Save Settings', 'jesty-crm' ), 'primary', 'submit', false ); ?>
			</div>
		</form>

		<div id="jcrm-test-result"></div>
	</div>

	<!-- Forms Management Section -->
	<?php if ( $is_configured ): ?>
	<div class="jesty-crm-card">
		<h2>
			<?php _e( 'Detected Forms', 'jesty-crm' ); ?>
			<button type="button" id="jcrm-refresh-forms" class="button button-small" style="margin-left: 10px;">
				<?php _e( 'Refresh', 'jesty-crm' ); ?>
			</button>
		</h2>

		<?php 
		$detected_forms = JCRM_Admin::$integrated_forms;
		if ( empty( $detected_forms ) ): 
		?>
			<p><?php _e( 'No supported forms detected. The plugin supports Contact Form 7, WPForms, Ninja Forms, Gravity Forms, Elementor Forms, Formidable Forms, Fluent Forms, and custom forms.', 'jesty-crm' ); ?></p>
			<p><?php _e( 'If you have forms installed, try refreshing the forms list or ensure the form plugins are active.', 'jesty-crm' ); ?></p>
		<?php else: ?>
			<div class="jesty-form-list">
				<?php foreach ( $detected_forms as $form ): ?>
					<div class="jesty-form-item">
						<h4><?php echo esc_html( $form['name'] ); ?></h4>
						<div class="plugin-name"><?php echo esc_html( $form['plugin'] ); ?></div>
						<div style="margin-top: 10px;">
							<label>
								<input type="checkbox" class="jesty-form-enable" 
									   value="<?php echo esc_attr( $form['id'] ); ?>"
									   <?php checked( in_array( $form['id'], $enabled_forms ) ); ?> />
								<?php _e( 'Enable sync to CRM', 'jesty-crm' ); ?>
							</label>
						</div>
						<div style="margin-top: 5px; font-size: 12px; color: #666;">
							<?php _e( 'Form ID:', 'jesty-crm' ); ?> <?php echo esc_html( $form['form_id'] ); ?>
						</div>
					</div>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>

		<!-- Auto-mapping Information -->
		<div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">
			<h3><?php _e( 'Automatic Field Mapping', 'jesty-crm' ); ?></h3>
			<p><?php _e( 'Jesty CRM automatically detects and maps common form fields:', 'jesty-crm' ); ?></p>
			<ul style="margin-left: 20px;">
				<li><strong><?php _e( 'Name fields:', 'jesty-crm' ); ?></strong> name, your-name, full_name, first_name, last_name</li>
				<li><strong><?php _e( 'Email fields:', 'jesty-crm' ); ?></strong> email, your-email, email_address, e_mail</li>
				<li><strong><?php _e( 'Phone fields:', 'jesty-crm' ); ?></strong> phone, your-phone, telephone, mobile, phone_number</li>
				<li><strong><?php _e( 'Message fields:', 'jesty-crm' ); ?></strong> message, your-message, comments, inquiry, description</li>
				<li><strong><?php _e( 'Company fields:', 'jesty-crm' ); ?></strong> company, organization, business_name</li>
			</ul>
			<p><em><?php _e( 'Custom field mapping can be configured from your Jesty CRM dashboard if needed.', 'jesty-crm' ); ?></em></p>
		</div>
	</div>

	<!-- Statistics Section -->
	<div class="jesty-crm-card">
		<h2><?php _e( 'Submission Statistics', 'jesty-crm' ); ?></h2>
		<div class="jesty-stats-grid">
			<div class="jesty-stat-item">
				<div class="jesty-stat-number" id="jesty-stat-total">0</div>
				<div class="jesty-stat-label"><?php _e( 'Total Submissions', 'jesty-crm' ); ?></div>
			</div>
			<div class="jesty-stat-item">
				<div class="jesty-stat-number" id="jesty-stat-successful">0</div>
				<div class="jesty-stat-label"><?php _e( 'Successful', 'jesty-crm' ); ?></div>
			</div>
			<div class="jesty-stat-item">
				<div class="jesty-stat-number" id="jesty-stat-failed">0</div>
				<div class="jesty-stat-label"><?php _e( 'Failed', 'jesty-crm' ); ?></div>
			</div>
			<div class="jesty-stat-item">
				<div class="jesty-stat-number" id="jesty-stat-last"><?php _e( 'Never', 'jesty-crm' ); ?></div>
				<div class="jesty-stat-label"><?php _e( 'Last Submission', 'jesty-crm' ); ?></div>
			</div>
		</div>
	</div>
	<?php endif; ?>

	<!-- Support Section -->
	<div class="jesty-crm-card">
		<h2><?php _e( 'Support & Documentation', 'jesty-crm' ); ?></h2>
		<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
			<div>
				<h4><?php _e( 'Need Help?', 'jesty-crm' ); ?></h4>
				<p><?php _e( 'Visit our documentation for setup guides and troubleshooting.', 'jesty-crm' ); ?></p>
				<a href="https://jesty-crm.vercel.app/docs" target="_blank" class="button button-secondary">
					<?php _e( 'View Documentation', 'jesty-crm' ); ?>
				</a>
			</div>
			<div>
				<h4><?php _e( 'Custom Forms', 'jesty-crm' ); ?></h4>
				<p><?php _e( 'Add the class "jesty-crm" to any custom form to enable automatic sync.', 'jesty-crm' ); ?></p>
				<code>&lt;form class="jesty-crm" method="post"&gt;</code>
			</div>
			<div>
				<h4><?php _e( 'Plugin Info', 'jesty-crm' ); ?></h4>
				<p><strong><?php _e( 'Version:', 'jesty-crm' ); ?></strong> <?php echo JCRM_VERSION; ?></p>
				<p><strong><?php _e( 'Status:', 'jesty-crm' ); ?></strong> 
					<?php echo $is_configured ? '<span style="color: green;">Active</span>' : '<span style="color: orange;">Setup Required</span>'; ?>
				</p>
			</div>
		</div>
	</div>

	<!-- Hidden fields for nonces -->
	<input type="hidden" id="jesty_test_nonce" value="<?php echo wp_create_nonce( 'jcrm_ajax_nonce' ); ?>" />
	<input type="hidden" id="jesty_forms_nonce" value="<?php echo wp_create_nonce( 'jcrm_ajax_nonce' ); ?>" />
	<input type="hidden" id="jesty_stats_nonce" value="<?php echo wp_create_nonce( 'jcrm_ajax_nonce' ); ?>" />
</div>