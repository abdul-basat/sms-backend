#!/bin/bash

# Fees Manager WhatsApp Automation Deployment Script
# This script automates the deployment process to a DigitalOcean droplet

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Default values
DROPLET_IP=""
DROPLET_USER="root"
SSH_KEY_PATH=""
DOCKER_COMPOSE_FILE="docker-compose.yml"
ENVIRONMENT="production"
BACKUP_ENABLED=true
HEALTH_CHECK_ENABLED=true

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy Fees Manager WhatsApp Automation to DigitalOcean droplet

OPTIONS:
    -i, --ip IP_ADDRESS        DigitalOcean droplet IP address
    -u, --user USER            SSH user (default: root)
    -k, --key SSH_KEY_PATH     Path to SSH private key
    -f, --file COMPOSE_FILE    Docker Compose file (default: docker-compose.yml)
    -e, --env ENVIRONMENT      Environment (production/staging) (default: production)
    -n, --no-backup           Disable backup before deployment
    -h, --health-check        Enable health check after deployment
    --help                    Show this help message

EXAMPLES:
    $0 -i 123.456.789.012 -k ~/.ssh/id_rsa
    $0 --ip 123.456.789.012 --user ubuntu --key ~/.ssh/droplet_key
    $0 -i 123.456.789.012 -k ~/.ssh/id_rsa -e staging

EOF
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -i|--ip)
                DROPLET_IP="$2"
                shift 2
                ;;
            -u|--user)
                DROPLET_USER="$2"
                shift 2
                ;;
            -k|--key)
                SSH_KEY_PATH="$2"
                shift 2
                ;;
            -f|--file)
                DOCKER_COMPOSE_FILE="$2"
                shift 2
                ;;
            -e|--env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -n|--no-backup)
                BACKUP_ENABLED=false
                shift
                ;;
            -h|--health-check)
                HEALTH_CHECK_ENABLED=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Function to validate prerequisites
validate_prerequisites() {
    print_status "Validating prerequisites..."
    
    # Check if required tools are installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    if ! command -v ssh &> /dev/null; then
        print_error "SSH is not installed. Please install SSH client first."
        exit 1
    fi
    
    # Validate required parameters
    if [[ -z "$DROPLET_IP" ]]; then
        print_error "Droplet IP address is required. Use -i or --ip option."
        exit 1
    fi
    
    if [[ -z "$SSH_KEY_PATH" ]]; then
        print_error "SSH key path is required. Use -k or --key option."
        exit 1
    fi
    
    if [[ ! -f "$SSH_KEY_PATH" ]]; then
        print_error "SSH key file not found: $SSH_KEY_PATH"
        exit 1
    fi
    
    if [[ ! -f "$DOCKER_DIR/$DOCKER_COMPOSE_FILE" ]]; then
        print_error "Docker Compose file not found: $DOCKER_DIR/$DOCKER_COMPOSE_FILE"
        exit 1
    fi
    
    print_success "Prerequisites validation passed"
}

# Function to test SSH connection
test_ssh_connection() {
    print_status "Testing SSH connection to $DROPLET_USER@$DROPLET_IP..."
    
    if ! ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$DROPLET_USER@$DROPLET_IP" "echo 'SSH connection successful'" &> /dev/null; then
        print_error "Failed to connect to droplet via SSH. Please check your IP address, SSH key, and network connection."
        exit 1
    fi
    
    print_success "SSH connection established"
}

# Main deployment function
main() {
    echo "🚀 Fees Manager WhatsApp Automation Deployment Script"
    echo "=================================================="
    echo
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Validate prerequisites
    validate_prerequisites
    
    # Test SSH connection
    test_ssh_connection
    
    print_success "Basic validation completed. Ready for deployment."
}

# Run main function with all arguments
main "$@"
