const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const crypto = require('crypto');

class WordPressPluginGenerator {
  
  static generatePluginZip(integrationData) {
    return new Promise((resolve, reject) => {
      const pluginDir = path.join(__dirname, '../jesty-crm-plugin');
      const outputPath = path.join(__dirname, '../wordpress-plugin/jesty-crm-plugin.zip');
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Create a file to stream archive data to
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level
      });
      
      // Listen for all archive data to be written
      output.on('close', () => {
        resolve({
          filePath: outputPath,
          size: archive.pointer(),
          downloadUrl: '/api/integrations/wordpress/plugin/download'
        });
      });
      
      // Handle errors
      archive.on('error', (err) => {
        reject(err);
      });
      
      // Pipe archive data to the file
      archive.pipe(output);
      
      // Add entire plugin directory structure
      archive.directory(pluginDir, 'jesty-crm-integration');
      
      // Generate and add custom configuration file with integration details
      const configContent = this.generateConfigFile(integrationData);
      archive.append(configContent, { 
        name: 'jesty-crm-integration/includes/config-auto.php' 
      });
      
      // Finalize the archive
      archive.finalize();
    });
  }
  
  static generateConfigFile(integrationData) {
    return `<?php
// Auto-generated configuration file for Jesty CRM Integration
// Generated on: ${new Date().toISOString()}

if (!defined('ABSPATH')) {
    exit;
}

// Pre-configure plugin with integration details
add_action('admin_init', function() {
    // Only set if not already configured
    if (!get_option('jesty_integration_key')) {
        update_option('jesty_integration_key', '${integrationData.integrationKey}');
    }
    if (!get_option('jesty_webhook_url')) {
        update_option('jesty_webhook_url', '${integrationData.webhookEndpoint}');
    }
    if (!get_option('jesty_site_configured')) {
        update_option('jesty_site_configured', true);
        update_option('jesty_configured_for_site', '${integrationData.siteUrl}');
    }
});

// Configuration constants
define('JESTY_CRM_API_ENDPOINT', '${process.env.API_BASE_URL || 'https://jesty-crm-api.vercel.app'}');
define('JESTY_CRM_INTEGRATION_ID', '${integrationData._id}');
define('JESTY_CRM_ORGANIZATION_ID', '${integrationData.organizationId}');

// Default field mapping configuration
$jesty_default_field_mapping = ${JSON.stringify(integrationData.leadMappingConfig || {}, null, 2)};

// Auto-mapping settings
$jesty_auto_mapping_config = ${JSON.stringify(integrationData.autoMapping || {}, null, 2)};

// Assignment settings
$jesty_assignment_config = ${JSON.stringify(integrationData.assignmentSettings || {}, null, 2)};
`;
  }
  
  static generatePluginCSS() {
    return `/* Jesty CRM Integration Admin Styles */
.jesty-crm-admin {
    max-width: 1200px;
}

.jesty-crm-card {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 1px 1px rgba(0,0,0,.04);
}

.jesty-crm-card h2 {
    margin-top: 0;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
}

.jesty-connection-status {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.jesty-connection-status.connected {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
}

.jesty-connection-status.disconnected {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
}

.jesty-form-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 15px;
    margin-top: 15px;
}

.jesty-form-item {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 15px;
}

.jesty-form-item h4 {
    margin: 0 0 8px 0;
    color: #495057;
}

.jesty-form-item .plugin-name {
    font-size: 12px;
    color: #6c757d;
    margin-bottom: 10px;
}

.jesty-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-top: 15px;
}

.jesty-stat-item {
    text-align: center;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 4px;
    border: 1px solid #dee2e6;
}

.jesty-stat-number {
    font-size: 2em;
    font-weight: bold;
    color: #007cba;
    margin-bottom: 5px;
}

.jesty-stat-label {
    font-size: 14px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.jesty-test-result {
    margin-top: 15px;
    padding: 10px;
    border-radius: 4px;
}

.jesty-test-result.success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
}

.jesty-test-result.error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
}

.jesty-setup-steps {
    counter-reset: step-counter;
}

.jesty-setup-steps li {
    counter-increment: step-counter;
    margin-bottom: 10px;
    padding-left: 30px;
    position: relative;
}

.jesty-setup-steps li::before {
    content: counter(step-counter);
    position: absolute;
    left: 0;
    top: 0;
    background: #007cba;
    color: white;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
}

.jesty-field-mapping-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
}

.jesty-field-mapping-table th,
.jesty-field-mapping-table td {
    padding: 10px;
    text-align: left;
    border-bottom: 1px solid #ddd;
}

.jesty-field-mapping-table th {
    background: #f8f9fa;
    font-weight: 600;
}

.jesty-auto-mapping-indicator {
    display: inline-block;
    background: #28a745;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
}

@media (max-width: 768px) {
    .jesty-form-list {
        grid-template-columns: 1fr;
    }
    
    .jesty-stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}`;
  }
  
  static generatePluginJS() {
    return `// Jesty CRM Integration Admin JavaScript
(function($) {
    'use strict';
    
    $(document).ready(function() {
        
        // Test connection functionality
        $('#jesty-test-connection').on('click', function() {
            var $button = $(this);
            var $result = $('#jesty-test-result');
            var integrationKey = $('input[name="jesty_integration_key"]').val();
            var webhookUrl = $('input[name="jesty_webhook_url"]').val();
            
            if (!integrationKey || !webhookUrl) {
                $result.html('<div class="jesty-test-result error">Please enter both Integration Key and Webhook URL</div>');
                return;
            }
            
            $button.prop('disabled', true).text('Testing...');
            $result.html('');
            
            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'jesty_test_connection',
                    integration_key: integrationKey,
                    webhook_url: webhookUrl,
                    nonce: $('#jesty_test_nonce').val()
                },
                success: function(response) {
                    if (response.success) {
                        $result.html('<div class="jesty-test-result success">✅ Connection successful! Your forms will now sync with Jesty CRM.</div>');
                        updateConnectionStatus(true);
                    } else {
                        $result.html('<div class="jesty-test-result error">❌ Connection failed: ' + (response.data || 'Unknown error') + '</div>');
                        updateConnectionStatus(false);
                    }
                },
                error: function(xhr, status, error) {
                    $result.html('<div class="jesty-test-result error">❌ Connection test failed: ' + error + '</div>');
                    updateConnectionStatus(false);
                },
                complete: function() {
                    $button.prop('disabled', false).text('Test Connection');
                }
            });
        });
        
        // Auto-save form settings
        $('.jesty-form-enable').on('change', function() {
            var $checkbox = $(this);
            var formId = $checkbox.val();
            var enabled = $checkbox.is(':checked');
            
            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'jesty_toggle_form',
                    form_id: formId,
                    enabled: enabled ? 1 : 0,
                    nonce: $('#jesty_forms_nonce').val()
                },
                success: function(response) {
                    if (response.success) {
                        showNotice('Form sync ' + (enabled ? 'enabled' : 'disabled') + ' successfully', 'success');
                    } else {
                        showNotice('Failed to update form settings', 'error');
                        $checkbox.prop('checked', !enabled); // Revert
                    }
                },
                error: function() {
                    showNotice('Failed to update form settings', 'error');
                    $checkbox.prop('checked', !enabled); // Revert
                }
            });
        });
        
        // Refresh forms list
        $('#jesty-refresh-forms').on('click', function() {
            var $button = $(this);
            
            $button.prop('disabled', true).text('Refreshing...');
            
            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'jesty_refresh_forms',
                    nonce: $('#jesty_forms_nonce').val()
                },
                success: function(response) {
                    if (response.success) {
                        location.reload(); // Refresh page to show updated forms
                    } else {
                        showNotice('Failed to refresh forms list', 'error');
                    }
                },
                error: function() {
                    showNotice('Failed to refresh forms list', 'error');
                },
                complete: function() {
                    $button.prop('disabled', false).text('Refresh Forms');
                }
            });
        });
        
        // Load statistics
        loadStatistics();
        
        // Auto-refresh stats every 30 seconds
        setInterval(loadStatistics, 30000);
        
    });
    
    function updateConnectionStatus(connected) {
        var $status = $('.jesty-connection-status');
        if (connected) {
            $status.removeClass('disconnected').addClass('connected').text('Connected');
        } else {
            $status.removeClass('connected').addClass('disconnected').text('Disconnected');
        }
    }
    
    function loadStatistics() {
        $.ajax({
            url: ajaxurl,
            type: 'POST',
            data: {
                action: 'jesty_get_stats',
                nonce: $('#jesty_stats_nonce').val()
            },
            success: function(response) {
                if (response.success && response.data) {
                    updateStatsDisplay(response.data);
                }
            }
        });
    }
    
    function updateStatsDisplay(stats) {
        $('#jesty-stat-total').text(stats.total_submissions || 0);
        $('#jesty-stat-successful').text(stats.successful_submissions || 0);
        $('#jesty-stat-failed').text(stats.failed_submissions || 0);
        
        if (stats.last_submission) {
            var lastDate = new Date(stats.last_submission * 1000);
            $('#jesty-stat-last').text(lastDate.toLocaleString());
        } else {
            $('#jesty-stat-last').text('Never');
        }
    }
    
    function showNotice(message, type) {
        var $notice = $('<div class="notice notice-' + type + ' is-dismissible"><p>' + message + '</p></div>');
        $('.jesty-crm-admin .wrap h1').after($notice);
        
        // Auto-dismiss after 3 seconds
        setTimeout(function() {
            $notice.fadeOut(function() {
                $notice.remove();
            });
        }, 3000);
    }
    
})(jQuery);`;
  }
  
  static generateLanguageFile() {
    return `# Copyright (C) 2024 Jesty CRM Integration
# This file is distributed under the same license as the Jesty CRM Integration package.
msgid ""
msgstr ""
"Project-Id-Version: Jesty CRM Integration 1.0.0\\n"
"Report-Msgid-Bugs-To: https://jesty-crm.vercel.app/support\\n"
"POT-Creation-Date: 2024-01-01 12:00:00+0000\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"Language-Team: Jesty CRM <support@jesty-crm.vercel.app>\\n"

#: jesty-crm-integration.php:15
msgid "Automatically send form submissions from your WordPress site to Jesty CRM. Supports Contact Form 7, WPForms, Ninja Forms, Gravity Forms, and custom forms."
msgstr ""

#: jesty-crm-integration.php:89
msgid "Jesty CRM Integration"
msgstr ""

#: jesty-crm-integration.php:90
msgid "Jesty CRM"
msgstr ""

#: jesty-crm-integration.php:110
msgid "Connection Settings"
msgstr ""

#: jesty-crm-integration.php:123
msgid "Integration Key"
msgstr ""

#: jesty-crm-integration.php:130
msgid "Webhook URL"
msgstr ""

#: jesty-crm-integration.php:155
msgid "Settings saved successfully!"
msgstr ""

#: jesty-crm-integration.php:160
msgid "Setup Instructions"
msgstr ""

#: jesty-crm-integration.php:162
msgid "Get your Integration Key and Webhook URL from your Jesty CRM WordPress integrations page"
msgstr ""

#: jesty-crm-integration.php:163
msgid "Enter the details in the form below"
msgstr ""

#: jesty-crm-integration.php:164
msgid "Test the connection"
msgstr ""

#: jesty-crm-integration.php:165
msgid "Select which forms you want to sync"
msgstr ""

#: jesty-crm-integration.php:166
msgid "Configure field mapping (optional - auto-mapping is enabled by default)"
msgstr ""

#: jesty-crm-integration.php:174
msgid "Your unique integration key from Jesty CRM"
msgstr ""

#: jesty-crm-integration.php:180
msgid "The webhook URL provided by Jesty CRM"
msgstr ""

#: jesty-crm-integration.php:186
msgid "Test Connection"
msgstr ""

#: jesty-crm-integration.php:192
msgid "Detected Forms"
msgstr ""

#: jesty-crm-integration.php:197
msgid "Field Mapping"
msgstr ""

#: jesty-crm-integration.php:202
msgid "Statistics"
msgstr ""`;
  }
  
  static generatePluginInfo(integration) {
    return {
      name: 'Jesty CRM Integration',
      version: '1.0.0',
      description: 'Automatically sync WordPress form submissions to Jesty CRM',
      integrationKey: integration.integrationKey,
      webhookUrl: integration.webhookEndpoint,
      siteUrl: integration.siteUrl,
      siteName: integration.siteName,
      downloadUrl: '/api/integrations/wordpress/plugin/download',
      setupInstructions: [
        'Download the plugin ZIP file',
        'Upload to WordPress via Plugins > Add New > Upload Plugin',
        'Activate the plugin',
        'Go to Settings > Jesty CRM',
        'The integration should be pre-configured',
        'Test the connection and select forms to sync'
      ],
      supportedPlugins: [
        'Contact Form 7',
        'WPForms',
        'Ninja Forms',
        'Gravity Forms',
        'Elementor Forms',
        'Custom HTML Forms'
      ],
      features: [
        'Automatic form detection',
        'Intelligent field mapping',
        'Real-time lead sync',
        'Duplicate prevention',
        'Assignment automation',
        'Statistics tracking'
      ]
    };
  }
}

module.exports = WordPressPluginGenerator;